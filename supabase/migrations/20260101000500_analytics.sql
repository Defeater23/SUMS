-- =============================================================================
-- SUMS — 06. Aggregates for dashboards and analytics
--
-- Every function that exposes institution-wide data re-checks authorization
-- server-side and is restricted to administrators. Personal dashboard figures
-- are computed under Row Level Security so a caller can only ever aggregate
-- their own rows.
--
-- Time zone handling: calendar-day buckets use the institution time zone
-- (`app_settings.timezone`). All returned timestamps are `timestamptz` and are
-- rendered by the client in the viewer's local zone.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Personal dashboard (students / faculty / administrators' own activity).
-- Runs as the caller, so RLS already limits the rows to the caller's own.
-- ---------------------------------------------------------------------------
create or replace function public.fn_my_dashboard_stats()
returns table (
  upcoming_count        bigint,
  pending_count         bigint,
  approved_count        bigint,
  completed_count       bigint,
  cancelled_count       bigint,
  rejected_count        bigint,
  total_count           bigint,
  unread_notifications  bigint,
  next_booking_at       timestamptz
)
language sql
stable
as $$
  select
    (select count(*) from public.bookings b where b.user_id = auth.uid()
       and b.status in ('pending','approved') and b.ends_at >= now())::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid() and b.status = 'pending')::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid() and b.status = 'approved')::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid() and b.status = 'completed')::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid() and b.status = 'cancelled')::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid() and b.status = 'rejected')::bigint,
    (select count(*) from public.bookings b where b.user_id = auth.uid())::bigint,
    (select count(*) from public.notifications n where n.user_id = auth.uid() and n.is_read = false)::bigint,
    (select min(b.starts_at) from public.bookings b where b.user_id = auth.uid()
       and b.status = 'approved' and b.starts_at >= now());
$$;

-- ---------------------------------------------------------------------------
-- Administrator dashboard
-- ---------------------------------------------------------------------------
create or replace function public.fn_admin_dashboard_stats()
returns table (
  total_resources      bigint,
  active_resources     bigint,
  inactive_resources   bigint,
  total_bookings       bigint,
  pending_approvals    bigint,
  upcoming_bookings    bigint,
  bookings_last_7_days bigint,
  total_users          bigint,
  active_users         bigint,
  open_feedback        bigint,
  avg_decision_hours   numeric,
  utilization_last_7d  numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.resources)::bigint,
    (select count(*) from public.resources where is_active)::bigint,
    (select count(*) from public.resources where not is_active)::bigint,
    (select count(*) from public.bookings)::bigint,
    (select count(*) from public.bookings where status = 'pending')::bigint,
    (select count(*) from public.bookings where status in ('approved','pending') and ends_at >= now())::bigint,
    (select count(*) from public.bookings where created_at >= now() - interval '7 days')::bigint,
    (select count(*) from public.profiles)::bigint,
    (select count(*) from public.profiles where is_active)::bigint,
    (select count(*) from public.feedback where status = 'open')::bigint,
    (select round(avg(extract(epoch from (decided_at - created_at)) / 3600.0)::numeric, 1)
       from public.bookings where decided_at is not null),
    (select coalesce(round(avg(utilization_pct), 1), 0)
       from public.fn_analytics_resource_utilization(now() - interval '7 days', now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking counts over time
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_booking_trends(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  day        date,
  created    bigint,
  approved   bigint,
  rejected   bigint,
  cancelled  bigint,
  completed  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  v_tz := public.app_timezone();

  return query
  with days as (
    select generate_series(
             (p_from at time zone v_tz)::date,
             (p_to   at time zone v_tz)::date,
             interval '1 day'
           )::date as day
  ),
  agg as (
    select (b.created_at at time zone v_tz)::date as day,
           count(*)::bigint                                          as created,
           count(*) filter (where b.status = 'approved')::bigint      as approved,
           count(*) filter (where b.status = 'rejected')::bigint      as rejected,
           count(*) filter (where b.status = 'cancelled')::bigint     as cancelled,
           count(*) filter (where b.status = 'completed')::bigint     as completed
      from public.bookings b
     where b.created_at >= (p_from at time zone v_tz)
       and b.created_at <  (p_to at time zone v_tz) + interval '1 day'
     group by 1
  )
  select d.day,
         coalesce(a.created, 0),
         coalesce(a.approved, 0),
         coalesce(a.rejected, 0),
         coalesce(a.cancelled, 0),
         coalesce(a.completed, 0)
    from days d
    left join agg a on a.day = d.day
   order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking status distribution
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_status_distribution(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (status public.booking_status, total bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select b.status, count(*)::bigint
    from public.bookings b
   where b.created_at >= p_from and b.created_at <= p_to
   group by b.status
   order by b.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking distribution by resource category
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_category_distribution(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (category text, total bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select coalesce(c.name, 'Uncategorised') as category, count(*)::bigint
    from public.bookings b
    join public.resources r on r.id = b.resource_id
    left join public.resource_categories c on c.id = r.category_id
   where b.created_at >= p_from and b.created_at <= p_to
   group by 1
   order by 2 desc, 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Most frequently booked resources
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_top_resources(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 8
)
returns table (
  resource_id    uuid,
  resource_name  text,
  category       text,
  booking_count  bigint,
  booked_minutes bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select r.id,
         r.name,
         coalesce(c.name, 'Uncategorised'),
         count(b.id)::bigint,
         coalesce(sum(extract(epoch from (b.ends_at - b.starts_at)) / 60), 0)::bigint
    from public.resources r
    left join public.resource_categories c on c.id = r.category_id
    left join public.bookings b
           on b.resource_id = r.id
          and b.status in ('approved', 'completed')
          and b.starts_at >= p_from
          and b.starts_at <= p_to
   group by r.id, r.name, c.name
   having count(b.id) > 0
   order by 4 desc, r.name
   limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Resource utilization over a period
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_resource_utilization(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  resource_id        uuid,
  resource_name      text,
  category           text,
  building           text,
  capacity           integer,
  booking_count      bigint,
  booked_minutes     bigint,
  available_minutes  bigint,
  utilization_pct    numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz          text;
  v_days        integer;
  v_weekends    boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  v_tz := public.app_timezone();
  select allow_weekends into v_weekends from public.app_settings where id;

  select count(*) into v_days
    from generate_series(
           (p_from at time zone v_tz)::date,
           (p_to   at time zone v_tz)::date,
           interval '1 day'
         ) as d(day)
   where v_weekends or extract(isodow from d.day) < 6;

  return query
  select r.id,
         r.name,
         coalesce(c.name, 'Uncategorised'),
         r.building,
         r.capacity,
         count(b.id)::bigint,
         coalesce(sum(extract(epoch from
           (least(b.ends_at, p_to) - greatest(b.starts_at, p_from))) / 60), 0)::bigint,
         (v_days * (extract(epoch from (r.closes_at - r.opens_at)) / 60))::bigint,
         case
           when v_days = 0 or r.closes_at = r.opens_at then 0::numeric
           else round(
             100.0 * coalesce(sum(extract(epoch from
               (least(b.ends_at, p_to) - greatest(b.starts_at, p_from))) / 60), 0)
             / (v_days * (extract(epoch from (r.closes_at - r.opens_at)) / 60)),
             1)
         end
    from public.resources r
    left join public.resource_categories c on c.id = r.category_id
    left join public.bookings b
           on b.resource_id = r.id
          and b.status in ('approved', 'completed')
          and b.starts_at < p_to
          and b.ends_at > p_from
   group by r.id, r.name, c.name, r.building, r.capacity, r.opens_at, r.closes_at
   order by 9 desc nulls last, r.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approval / rejection trend
-- ---------------------------------------------------------------------------
create or replace function public.fn_analytics_decision_trends(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  day            date,
  approved       bigint,
  rejected       bigint,
  decided        bigint,
  approval_rate  numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  v_tz := public.app_timezone();

  return query
  with days as (
    select generate_series(
             (p_from at time zone v_tz)::date,
             (p_to   at time zone v_tz)::date,
             interval '1 day'
           )::date as day
  ),
  agg as (
    select (b.decided_at at time zone v_tz)::date as day,
           count(*) filter (where b.status = 'approved')::bigint as approved,
           count(*) filter (where b.status = 'rejected')::bigint as rejected
      from public.bookings b
     where b.decided_at is not null
       and b.decided_at >= (p_from at time zone v_tz)
       and b.decided_at <  (p_to at time zone v_tz) + interval '1 day'
     group by 1
  )
  select d.day,
         coalesce(a.approved, 0),
         coalesce(a.rejected, 0),
         coalesce(a.approved, 0) + coalesce(a.rejected, 0),
         case
           when coalesce(a.approved, 0) + coalesce(a.rejected, 0) = 0 then null
           else round(100.0 * coalesce(a.approved, 0)
                      / (coalesce(a.approved, 0) + coalesce(a.rejected, 0)), 1)
         end
    from days d
    left join agg a on a.day = d.day
   order by d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feedback summary for administrators
-- ---------------------------------------------------------------------------
create or replace function public.fn_feedback_summary()
returns table (
  total_feedback   bigint,
  average_rating   numeric,
  open_feedback    bigint,
  reviewed_feedback bigint,
  low_rating_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select (count(*))::bigint,
         round(avg(rating)::numeric, 2),
         (count(*) filter (where status = 'open'))::bigint,
         (count(*) filter (where status = 'reviewed'))::bigint,
         (count(*) filter (where rating <= 2))::bigint
    from public.feedback;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_my_dashboard_stats() from public, anon;
revoke execute on function public.fn_admin_dashboard_stats() from public, anon;
revoke execute on function public.fn_analytics_booking_trends(timestamptz, timestamptz) from public, anon;
revoke execute on function public.fn_analytics_status_distribution(timestamptz, timestamptz) from public, anon;
revoke execute on function public.fn_analytics_category_distribution(timestamptz, timestamptz) from public, anon;
revoke execute on function public.fn_analytics_top_resources(timestamptz, timestamptz, integer) from public, anon;
revoke execute on function public.fn_analytics_resource_utilization(timestamptz, timestamptz) from public, anon;
revoke execute on function public.fn_analytics_decision_trends(timestamptz, timestamptz) from public, anon;
revoke execute on function public.fn_feedback_summary() from public, anon;

grant execute on function public.fn_my_dashboard_stats() to authenticated;
grant execute on function public.fn_admin_dashboard_stats() to authenticated;
grant execute on function public.fn_analytics_booking_trends(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_analytics_status_distribution(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_analytics_category_distribution(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_analytics_top_resources(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.fn_analytics_resource_utilization(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_analytics_decision_trends(timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_feedback_summary() to authenticated;
