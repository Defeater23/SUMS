-- =============================================================================
-- SUMS — 04. Authorization helpers, triggers and server-side business logic
--
-- All state-changing business rules live here (and in the exclusion constraint)
-- so that they are enforced regardless of which client calls them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_faculty_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role in ('faculty', 'admin') from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Server-side (service-role) requests.
--
-- The service-role key never reaches the browser; it is used only by trusted
-- administrative tooling such as the documented provisioning script. Without
-- this distinction it would be impossible to appoint the very first
-- administrator, since every role change requires an existing administrator.
-- ---------------------------------------------------------------------------
create or replace function public.is_service_request()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (current_setting('request.jwt.claims', true)::jsonb) ->> 'role'
  ) = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- Profile provisioning.
--
-- A profile is created for every new auth user. The requested role is honoured
-- ONLY for the unprivileged roles: a caller can never obtain 'admin' by
-- sending crafted sign-up metadata (any other value falls back to 'student').
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requested text;
  v_role      public.user_role := 'student';
begin
  v_requested := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', ''));
  if v_requested in ('student', 'faculty') then
    v_role := v_requested::public.user_role;
  end if;

  insert into public.profiles (id, email, full_name, department, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email,''), '@', 1)),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'department', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard: role and identity are immutable for non-admins.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'A profile id cannot be changed.' using errcode = '42501';
  end if;

  -- Trusted server-side tooling (see is_service_request) may provision the
  -- first administrator; interactive sessions always need an administrator.
  if public.is_service_request() then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators may change user roles.' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active and not public.is_admin() then
    raise exception 'Only administrators may change account status.' using errcode = '42501';
  end if;

  if new.email is distinct from old.email and not public.is_admin() then
    raise exception 'An email address can only be changed by an administrator.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_role_escalation on public.profiles;
create trigger trg_profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ---------------------------------------------------------------------------
-- Notification generation — driven by real booking events.
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type  public.notification_type;
  v_title text;
  v_body  text;
  v_when  text;
begin
  v_when := to_char(new.starts_at, 'Dy DD Mon YYYY HH24:MI');

  if tg_op = 'INSERT' then
    v_type  := 'booking_created';
    v_title := case when new.status = 'approved' then 'Booking confirmed' else 'Booking request submitted' end;
    v_body  := case
                 when new.status = 'approved'
                   then format('Your booking starting %s is confirmed.', v_when)
                 else format('Your booking request for %s is awaiting approval.', v_when)
               end;

    insert into public.notifications (user_id, booking_id, type, title, body)
    values (new.user_id, new.id, v_type, v_title, v_body);

    -- Administrators are notified about each new request they must review.
    if new.status = 'pending' then
      insert into public.notifications (user_id, booking_id, type, title, body)
      select p.id, new.id, 'booking_updated', 'New booking request',
             format('A new booking request for %s needs review.', v_when)
        from public.profiles p
       where p.role = 'admin'
         and p.is_active;
    end if;

    return new;
  end if;

  -- UPDATE: only react to a real status transition.
  if new.status is distinct from old.status then
    v_type := case new.status
                when 'approved'  then 'booking_approved'
                when 'rejected'  then 'booking_rejected'
                when 'cancelled' then 'booking_cancelled'
                when 'completed' then 'booking_completed'
                else 'booking_updated'
              end;
    v_title := case new.status
                 when 'approved'  then 'Booking approved'
                 when 'rejected'  then 'Booking rejected'
                 when 'cancelled' then 'Booking cancelled'
                 when 'completed' then 'Booking completed'
                 else 'Booking updated'
               end;
    v_body := case new.status
                when 'approved'  then format('Your booking starting %s was approved.', v_when)
                when 'rejected'  then format('Your booking starting %s was rejected.%s', v_when,
                                            coalesce(' Reason: ' || nullif(btrim(new.decision_reason), ''), ''))
                when 'cancelled' then format('Your booking starting %s was cancelled.', v_when)
                when 'completed' then format('Your booking starting %s is now complete. You can leave feedback.', v_when)
                else format('Your booking starting %s was updated.', v_when)
              end;

    insert into public.notifications (user_id, booking_id, type, title, body)
    values (new.user_id, new.id, v_type, v_title, v_body);

    -- Tell administrators when a previously approved slot is released.
    if new.status = 'cancelled' and old.status = 'approved' then
      insert into public.notifications (user_id, booking_id, type, title, body)
      select p.id, new.id, 'booking_updated', 'Reservation released',
             format('A booking for %s was cancelled and the slot is free again.', v_when)
        from public.profiles p
       where p.role = 'admin'
         and p.is_active;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_notify on public.bookings;
create trigger trg_bookings_notify
  after insert or update of status on public.bookings
  for each row execute function public.notify_booking_change();

-- ---------------------------------------------------------------------------
-- Audit trail for catalogue changes.
-- ---------------------------------------------------------------------------
create or replace function public.audit_resource_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_id     uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'resource.created'; v_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := case when new.is_active is distinct from old.is_active
                     then (case when new.is_active then 'resource.activated' else 'resource.deactivated' end)
                     else 'resource.updated' end;
    v_id := new.id;
  else
    v_action := 'resource.deleted'; v_id := old.id;
  end if;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_action, 'resource', v_id::text,
          jsonb_build_object('name', coalesce(new.name, old.name)));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_resources_audit on public.resources;
create trigger trg_resources_audit
  after insert or update or delete on public.resources
  for each row execute function public.audit_resource_change();

-- ===========================================================================
-- Booking business logic
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Validate a booking request without persisting it. Used by the UI to give
-- fast feedback; the same rules are re-applied by create_booking().
-- ---------------------------------------------------------------------------
create or replace function public.validate_booking(
  p_resource_id uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_attendees   integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource  public.resources;
  v_settings  public.app_settings;
  v_duration  integer;
  v_tz        text;
  v_start_loc timestamp;
  v_end_loc   timestamp;
begin
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Choose a start and end time.' using errcode = '22023';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'The end time must be after the start time.' using errcode = '22023';
  end if;

  select * into v_resource from public.resources where id = p_resource_id;
  if not found then
    raise exception 'That resource does not exist.' using errcode = 'P0002';
  end if;

  if not v_resource.is_active then
    raise exception 'This resource is currently unavailable for booking.' using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id;

  v_duration := ceil(extract(epoch from (p_ends_at - p_starts_at)) / 60.0)::integer;

  if v_duration < v_resource.min_booking_minutes then
    raise exception 'Bookings for this resource must be at least % minutes long.',
      v_resource.min_booking_minutes using errcode = '22023';
  end if;

  if v_duration > v_resource.max_booking_minutes then
    raise exception 'Bookings for this resource may not exceed % minutes.',
      v_resource.max_booking_minutes using errcode = '22023';
  end if;

  if p_starts_at < now() + make_interval(mins => v_settings.min_lead_time_minutes) then
    raise exception 'Bookings must start at least % minutes from now.',
      v_settings.min_lead_time_minutes using errcode = '22023';
  end if;

  if p_starts_at > now() + make_interval(days => v_resource.advance_days) then
    raise exception 'Bookings can only be made up to % days in advance.',
      v_resource.advance_days using errcode = '22023';
  end if;

  v_tz := v_settings.timezone;
  v_start_loc := p_starts_at at time zone v_tz;
  v_end_loc   := p_ends_at   at time zone v_tz;

  if v_start_loc::date <> v_end_loc::date then
    raise exception 'A booking must start and end on the same day.' using errcode = '22023';
  end if;

  if not v_settings.allow_weekends and extract(isodow from v_start_loc) >= 6 then
    raise exception 'Bookings are not available on weekends.' using errcode = '22023';
  end if;

  if v_start_loc::time < v_resource.opens_at or v_end_loc::time > v_resource.closes_at then
    raise exception 'This resource can only be booked between % and % (%).',
      to_char(v_resource.opens_at, 'HH24:MI'),
      to_char(v_resource.closes_at, 'HH24:MI'),
      v_tz using errcode = '22023';
  end if;

  if (extract(epoch from (v_start_loc - date_trunc('day', v_start_loc))) / 60)::integer
       % v_settings.slot_granularity_mins <> 0
     or (extract(epoch from (v_end_loc - date_trunc('day', v_end_loc))) / 60)::integer
       % v_settings.slot_granularity_mins <> 0 then
    raise exception 'Bookings must align to % minute slots.',
      v_settings.slot_granularity_mins using errcode = '22023';
  end if;

  if p_attendees is not null then
    if p_attendees <= 0 then
      raise exception 'The number of attendees must be greater than zero.' using errcode = '22023';
    end if;
    if v_resource.capacity is not null and p_attendees > v_resource.capacity then
      raise exception 'This resource seats % people, but % attendees were requested.',
        v_resource.capacity, p_attendees using errcode = '22023';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_booking — the only supported way to create a booking.
-- Concurrency safety comes from the bookings_no_overlap exclusion constraint:
-- two simultaneous requests for the same slot cannot both succeed.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_resource_id uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_purpose     text default null,
  p_attendees   integer default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_resource public.resources;
  v_settings public.app_settings;
  v_status   public.booking_status;
  v_row      public.bookings;
begin
  if v_user is null then
    raise exception 'You must be signed in to create a booking.' using errcode = '28000';
  end if;

  if not exists (select 1 from public.profiles where id = v_user and is_active) then
    raise exception 'Your account is not active.' using errcode = '42501';
  end if;

  perform public.validate_booking(p_resource_id, p_starts_at, p_ends_at, p_attendees);

  select * into v_resource from public.resources where id = p_resource_id;
  select * into v_settings from public.app_settings where id;

  if v_resource.requires_approval
     and not (public.current_user_role() = any (v_settings.auto_approve_roles)) then
    v_status := 'pending';
  else
    v_status := 'approved';
  end if;

  begin
    insert into public.bookings (resource_id, user_id, starts_at, ends_at, purpose, attendees, status)
    values (
      p_resource_id,
      v_user,
      p_starts_at,
      p_ends_at,
      nullif(btrim(coalesce(p_purpose, '')), ''),
      p_attendees,
      v_status
    )
    returning * into v_row;
  exception
    when exclusion_violation then
      raise exception 'That time slot has just been reserved for this resource. Please choose another slot.'
        using errcode = 'P0001';
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_settings public.app_settings;
  v_row      public.bookings;
  v_admin    boolean;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  v_admin := public.is_admin();

  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  if v_row.user_id <> v_user and not v_admin then
    raise exception 'You may only cancel your own bookings.' using errcode = '42501';
  end if;

  if v_row.status not in ('pending', 'approved') then
    raise exception 'A % booking can no longer be cancelled.', v_row.status::text using errcode = '22023';
  end if;

  select * into v_settings from public.app_settings where id;

  if v_row.status = 'approved'
     and not v_admin
     and v_row.starts_at < now() + make_interval(mins => v_settings.cancellation_cutoff_mins) then
    raise exception 'Approved bookings must be cancelled at least % minutes before they start.',
      v_settings.cancellation_cutoff_mins using errcode = '22023';
  end if;

  update public.bookings
     set status          = 'cancelled',
         cancelled_at    = now(),
         decision_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), decision_reason)
   where id = p_booking_id
  returning * into v_row;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (v_user, 'booking.cancelled', 'booking', v_row.id::text,
          jsonb_build_object('resource_id', v_row.resource_id, 'on_behalf_of_admin', v_admin and v_row.user_id <> v_user));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_booking — administrator approval / rejection.
-- Approval re-validates availability inside the same transaction, so a stale
-- "pending" request can never be approved on top of an existing reservation.
-- ---------------------------------------------------------------------------
create or replace function public.decide_booking(
  p_booking_id uuid,
  p_decision   public.booking_status,
  p_reason     text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review booking requests.' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'A decision must be either approved or rejected.' using errcode = '22023';
  end if;

  select * into v_row from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'This request is already %.', v_row.status::text using errcode = '22023';
  end if;

  if p_decision = 'rejected' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting a request.' using errcode = '22023';
  end if;

  begin
    update public.bookings
       set status          = p_decision,
           decided_by      = v_user,
           decided_at      = now(),
           decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_booking_id
    returning * into v_row;
  exception
    when exclusion_violation then
      raise exception 'This slot is no longer available — it overlaps a reservation that was approved in the meantime.'
        using errcode = 'P0001';
  end;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (v_user, 'booking.' || p_decision::text, 'booking', v_row.id::text,
          jsonb_build_object('reason', v_row.decision_reason));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_past_bookings — moves finished approved bookings to 'completed'.
-- Idempotent; safe to call from the dashboard. Non-admins only affect their
-- own bookings.
-- ---------------------------------------------------------------------------
create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  update public.bookings
     set status = 'completed'
   where status = 'approved'
     and ends_at < now()
     and (public.is_admin() or user_id = v_user);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability: blocking reservations for a resource (no personal data).
-- ---------------------------------------------------------------------------
create or replace function public.get_resource_availability(
  p_resource_id uuid,
  p_from        timestamptz,
  p_to          timestamptz
)
returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz, status public.booking_status)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id, b.starts_at, b.ends_at, b.status
    from public.bookings b
   where b.resource_id = p_resource_id
     and b.status in ('approved', 'completed')
     and b.starts_at < p_to
     and b.ends_at > p_from
   order by b.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  update public.notifications
     set is_read = true,
         read_at = coalesce(read_at, now())
   where user_id = v_user
     and is_read = false
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_resource_id uuid,
  p_rating      smallint,
  p_comment     text default null,
  p_booking_id  uuid default null
)
returns public.feedback
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_booking_id uuid;
  v_row        public.feedback;
begin
  if v_user is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'A rating between 1 and 5 is required.' using errcode = '22023';
  end if;

  if p_booking_id is not null then
    select b.id into v_booking_id
      from public.bookings b
     where b.id = p_booking_id
       and b.user_id = v_user
       and b.resource_id = p_resource_id
       and b.status in ('approved', 'completed');
  else
    select b.id into v_booking_id
      from public.bookings b
     where b.user_id = v_user
       and b.resource_id = p_resource_id
       and b.status in ('approved', 'completed')
     order by b.starts_at desc
     limit 1;
  end if;

  if v_booking_id is null then
    raise exception 'You can only review a resource that you have booked.' using errcode = '42501';
  end if;

  insert into public.feedback (user_id, resource_id, booking_id, rating, comment)
  values (v_user, p_resource_id, v_booking_id, p_rating,
          nullif(btrim(coalesce(p_comment, '')), ''))
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'You have already submitted feedback for that booking.' using errcode = '23505';
end;
$$;

create or replace function public.review_feedback(
  p_feedback_id uuid,
  p_notes       text default null
)
returns public.feedback
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.feedback;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review feedback.' using errcode = '42501';
  end if;

  update public.feedback
     set status      = 'reviewed',
         admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_feedback_id
  returning * into v_row;

  if not found then
    raise exception 'Feedback not found.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- User administration
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row        public.profiles;
  v_admin_left integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators may change user roles.' using errcode = '42501';
  end if;

  select * into v_row from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  if v_row.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admin_left from public.profiles where role = 'admin' and is_active;
    if v_admin_left <= 1 then
      raise exception 'The last active administrator cannot be demoted.' using errcode = '22023';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into v_row;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'user.role_changed', 'profile', p_user_id::text,
          jsonb_build_object('role', p_role));

  return v_row;
end;
$$;

create or replace function public.set_user_active(
  p_user_id   uuid,
  p_is_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row        public.profiles;
  v_admin_left integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators may change user status.' using errcode = '42501';
  end if;

  select * into v_row from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  if v_row.id = auth.uid() and not p_is_active then
    raise exception 'You cannot deactivate your own account.' using errcode = '22023';
  end if;

  if v_row.role = 'admin' and not p_is_active then
    select count(*) into v_admin_left
      from public.profiles
     where role = 'admin' and is_active and id <> p_user_id;
    if v_admin_left = 0 then
      raise exception 'The last active administrator cannot be deactivated.' using errcode = '22023';
    end if;
  end if;

  update public.profiles set is_active = p_is_active where id = p_user_id returning * into v_row;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when p_is_active then 'user.activated' else 'user.deactivated' end,
          'profile', p_user_id::text, '{}'::jsonb);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is executable by anonymous callers, and the
-- privileged helpers are revoked from PUBLIC (Postgres grants EXECUTE to
-- PUBLIC by default, which must be undone explicitly).
-- ---------------------------------------------------------------------------
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_faculty_or_admin() from public, anon;
revoke execute on function public.is_service_request() from public, anon, authenticated;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.app_timezone() from public, anon;
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
revoke execute on function public.set_user_active(uuid, boolean) from public, anon;
revoke execute on function public.review_feedback(uuid, text) from public, anon;
revoke execute on function public.decide_booking(uuid, public.booking_status, text) from public, anon;
revoke execute on function public.notify_booking_change() from public, anon, authenticated;
revoke execute on function public.audit_resource_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_role_escalation() from public, anon, authenticated;
revoke execute on function public.complete_past_bookings() from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_faculty_or_admin() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.app_timezone() to authenticated;
grant execute on function public.validate_booking(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.create_booking(uuid, timestamptz, timestamptz, text, integer) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.complete_past_bookings() to authenticated;
grant execute on function public.get_resource_availability(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.submit_feedback(uuid, smallint, text, uuid) to authenticated;
grant execute on function public.decide_booking(uuid, public.booking_status, text) to authenticated;
grant execute on function public.review_feedback(uuid, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
