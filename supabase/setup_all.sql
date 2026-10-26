-- =============================================================================
-- SUMS — 01. Extensions, enums, shared helpers
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "btree_gist" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('student', 'faculty', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum
      ('pending', 'approved', 'rejected', 'cancelled', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum
      ('booking_created', 'booking_approved', 'booking_rejected',
       'booking_cancelled', 'booking_completed', 'booking_updated');
  end if;

  if not exists (select 1 from pg_type where typname = 'feedback_status') then
    create type public.feedback_status as enum ('open', 'reviewed');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Institution-wide configuration ("availability rules", booking rules).
-- Exactly one row is allowed; the boolean primary key enforces that.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                       boolean primary key default true check (id),
  institution_name         text        not null default 'SUMS University',
  timezone                 text        not null default 'Asia/Kolkata',
  booking_open_hour        smallint    not null default 7  check (booking_open_hour  between 0 and 23),
  booking_close_hour       smallint    not null default 22 check (booking_close_hour between 1 and 24),
  allow_weekends           boolean     not null default true,
  min_lead_time_minutes    integer     not null default 0    check (min_lead_time_minutes >= 0),
  cancellation_cutoff_mins integer     not null default 120  check (cancellation_cutoff_mins >= 0),
  slot_granularity_mins    integer     not null default 30   check (slot_granularity_mins between 5 and 240),
  -- Roles whose bookings skip the approval step even when the resource
  -- requires approval. Empty by default => every request is reviewed.
  auto_approve_roles       public.user_role[] not null default array[]::public.user_role[],
  updated_at               timestamptz not null default now(),
  constraint app_settings_hours_chk check (booking_open_hour < booking_close_hour)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Time zone used for operating-hour and rule evaluation.
-- ---------------------------------------------------------------------------
create or replace function public.app_timezone()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select timezone from public.app_settings where id), 'UTC');
$$;
-- =============================================================================
-- SUMS — 02. Core relational schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user. `role` is the single source of truth for
-- authorization and can only be changed by an administrator.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text        not null default '',
  department  text,
  phone       text,
  role        public.user_role not null default 'student',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.role is
  'Authorization source of truth. Defaults to student; only admins may change it (enforced by trigger).';

-- ---------------------------------------------------------------------------
-- resource_categories
-- ---------------------------------------------------------------------------
create table if not exists public.resource_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint resource_categories_name_key unique (name)
);

-- ---------------------------------------------------------------------------
-- resources — the catalogue of bookable university facilities and equipment.
-- Resources are deactivated rather than deleted so that historical bookings
-- stay referentially intact (`on delete restrict` below).
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id                  uuid primary key default gen_random_uuid(),
  name                text        not null,
  description         text,
  category_id         uuid        references public.resource_categories (id) on delete set null,
  building            text,
  location            text,
  capacity            integer     check (capacity is null or capacity >= 0),
  equipment           text[]      not null default '{}',
  image_url           text,
  requires_approval   boolean     not null default false,
  opens_at            time        not null default '07:00',
  closes_at           time        not null default '22:00',
  min_booking_minutes integer     not null default 15  check (min_booking_minutes between 5 and 1440),
  max_booking_minutes integer     not null default 240 check (max_booking_minutes between 5 and 1440),
  advance_days        integer     not null default 30  check (advance_days between 1 and 365),
  is_active           boolean     not null default true,
  created_by          uuid        references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint resources_hours_chk check (opens_at < closes_at),
  constraint resources_booking_window_chk check (min_booking_minutes <= max_booking_minutes),
  constraint resources_name_not_blank check (length(btrim(name)) > 0)
);

-- ---------------------------------------------------------------------------
-- bookings — the central transactional table.
--
-- Overlap prevention
-- ------------------
--   `occupied_period` is a generated tstzrange that is non-null ONLY for the
--   statuses that hold a slot (approved / completed). The GiST exclusion
--   constraint below makes it physically impossible for two rows on the same
--   resource to hold overlapping periods, even when requests arrive
--   simultaneously — the second transaction fails with SQLSTATE 23P01.
--
--   Pending requests deliberately do NOT hold a slot: they are outstanding
--   requests, not reservations. Availability is re-checked transactionally at
--   approval time (see public.decide_booking) so an approval can never create
--   an overlap. This policy is documented in README → "Booking policy".
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  resource_id     uuid        not null references public.resources (id) on delete restrict,
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  purpose         text,
  attendees       integer     check (attendees is null or attendees > 0),
  status          public.booking_status not null default 'pending',
  decision_reason text,
  decided_by      uuid        references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  occupied_period tstzrange generated always as (
    case
      when status in ('approved', 'completed')
        then tstzrange(starts_at, ends_at, '[)')
      else null
    end
  ) stored,
  constraint bookings_time_order_chk check (ends_at > starts_at),
  constraint bookings_no_overlap exclude using gist (
    resource_id with =,
    occupied_period with &&
  )
);

comment on constraint bookings_no_overlap on public.bookings is
  'Concurrency-safe double-booking prevention: overlapping approved/completed periods are rejected by the database.';

-- ---------------------------------------------------------------------------
-- notifications — database-backed, generated by triggers on real events.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  booking_id uuid        references public.bookings (id) on delete cascade,
  type       public.notification_type not null,
  title      text        not null,
  body       text,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  resource_id uuid        not null references public.resources (id) on delete cascade,
  booking_id  uuid        references public.bookings (id) on delete set null,
  rating      smallint    not null check (rating between 1 and 5),
  comment     text,
  status      public.feedback_status not null default 'open',
  admin_notes text,
  reviewed_by uuid        references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint feedback_one_per_booking unique (user_id, booking_id)
);

-- ---------------------------------------------------------------------------
-- audit_events — append-only trail of privileged / state-changing actions.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id         bigserial primary key,
  actor_id   uuid        references public.profiles (id) on delete set null,
  action     text        not null,
  entity     text        not null,
  entity_id  text,
  metadata   jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_resource_categories_updated_at on public.resource_categories;
create trigger trg_resource_categories_updated_at
  before update on public.resource_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_resources_updated_at on public.resources;
create trigger trg_resources_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_feedback_updated_at on public.feedback;
create trigger trg_feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
-- =============================================================================
-- SUMS — 03. Indexes
-- =============================================================================

-- profiles ------------------------------------------------------------------
create index if not exists profiles_role_idx        on public.profiles (role);
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
create index if not exists profiles_full_name_idx   on public.profiles (lower(full_name));

-- resource_categories -------------------------------------------------------
-- (name uniqueness already creates an index)

-- resources ----------------------------------------------------------------
create index if not exists resources_category_idx   on public.resources (category_id);
create index if not exists resources_is_active_idx  on public.resources (is_active);
create index if not exists resources_building_idx   on public.resources (building);
create index if not exists resources_name_lower_idx  on public.resources (lower(name));
create index if not exists resources_equipment_gin  on public.resources using gin (equipment);

-- bookings -----------------------------------------------------------------
create index if not exists bookings_resource_start_idx
  on public.bookings (resource_id, starts_at desc);
create index if not exists bookings_user_start_idx
  on public.bookings (user_id, starts_at desc);
create index if not exists bookings_status_idx
  on public.bookings (status);
create index if not exists bookings_starts_at_idx
  on public.bookings (starts_at desc);
create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);
create index if not exists bookings_pending_idx
  on public.bookings (created_at)
  where status = 'pending';

-- notifications ------------------------------------------------------------
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;
create index if not exists notifications_booking_idx
  on public.notifications (booking_id);

-- feedback -----------------------------------------------------------------
create index if not exists feedback_resource_idx on public.feedback (resource_id);
create index if not exists feedback_user_idx     on public.feedback (user_id);
create index if not exists feedback_status_idx   on public.feedback (status);

-- audit_events -------------------------------------------------------------
create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_entity_idx     on public.audit_events (entity, entity_id);
create index if not exists audit_events_actor_idx      on public.audit_events (actor_id);
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
-- =============================================================================
-- SUMS — 05. Row Level Security
--
-- Every table holding protected data has RLS enabled and an explicit policy.
-- Authorization is enforced here (and in business-logic functions), never only
-- in the UI.
--
-- Note on writes to `bookings` / `feedback`: there are intentionally NO
-- insert/update policies. All state changes must go through the validated,
-- audited SECURITY DEFINER functions in migration 04. This makes it impossible
-- for a client to invent a booking, self-approve it, or bypass the
-- double-booking constraint by writing to the table directly.
-- =============================================================================

alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.resource_categories enable row level security;
alter table public.resources           enable row level security;
alter table public.bookings            enable row level security;
alter table public.notifications       enable row level security;
alter table public.feedback            enable row level security;
alter table public.audit_events        enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges (defence in depth: RLS plus explicit grants)
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ===========================================================================
-- app_settings
-- ===========================================================================
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- profiles
-- ===========================================================================
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Insert is only used by the auth trigger (which runs as the table owner);
-- allowing self-insert keeps the door open for repair scripts.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ===========================================================================
-- resource_categories
-- ===========================================================================
drop policy if exists resource_categories_select on public.resource_categories;
create policy resource_categories_select
  on public.resource_categories for select
  to authenticated
  using (true);

drop policy if exists resource_categories_write_admin on public.resource_categories;
create policy resource_categories_write_admin
  on public.resource_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- resources
-- ===========================================================================
drop policy if exists resources_select_authenticated on public.resources;
create policy resources_select_authenticated
  on public.resources for select
  to authenticated
  using (true);

drop policy if exists resources_insert_admin on public.resources;
create policy resources_insert_admin
  on public.resources for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists resources_update_admin on public.resources;
create policy resources_update_admin
  on public.resources for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Resources are never hard-deleted: `bookings.resource_id` uses ON DELETE
-- RESTRICT precisely so historical records survive deactivation.
drop policy if exists resources_delete_admin on public.resources;
create policy resources_delete_admin
  on public.resources for delete
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- bookings
-- ===========================================================================
drop policy if exists bookings_select_own_or_admin on public.bookings;
create policy bookings_select_own_or_admin
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No INSERT / UPDATE / DELETE policies on purpose — see the header comment.

-- ===========================================================================
-- notifications
-- ===========================================================================
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- ===========================================================================
-- feedback
-- ===========================================================================
drop policy if exists feedback_select_own_or_admin on public.feedback;
create policy feedback_select_own_or_admin
  on public.feedback for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Feedback is created through public.submit_feedback(), which verifies that
-- the caller actually booked the resource. Administrators may annotate.
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin
  on public.feedback for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===========================================================================
-- audit_events — read-only for administrators, written by triggers.
-- ===========================================================================
drop policy if exists audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin
  on public.audit_events for select
  to authenticated
  using (public.is_admin());
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
-- =============================================================================
-- SUMS — seed data (idempotent, safe to re-run)
--
-- This seeds the resource catalogue and institution settings only. It does NOT
-- create authentication users: accounts must be created through Supabase Auth
-- (see `scripts/seed-demo-data.mjs`, which uses the service-role key locally
-- and never stores credentials in source control).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Institution settings
-- ---------------------------------------------------------------------------
update public.app_settings
   set institution_name         = 'SUMS University',
       timezone                 = 'Asia/Kolkata',
       booking_open_hour        = 7,
       booking_close_hour       = 22,
       allow_weekends           = true,
       min_lead_time_minutes    = 0,
       cancellation_cutoff_mins = 120,
       slot_granularity_mins    = 30,
       auto_approve_roles       = array[]::public.user_role[]
 where id;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into public.resource_categories (id, name, description) values
  ('11111111-1111-1111-1111-111111111101', 'Classrooms',     'General teaching rooms with fixed seating'),
  ('11111111-1111-1111-1111-111111111102', 'Laboratories',   'Specialised labs requiring supervision'),
  ('11111111-1111-1111-1111-111111111103', 'Seminar Rooms',  'Small rooms for seminars and tutorials'),
  ('11111111-1111-1111-1111-111111111104', 'Meeting Rooms',  'Rooms for staff and committee meetings'),
  ('11111111-1111-1111-1111-111111111105', 'Auditoriums',    'Large venues for events and lectures'),
  ('11111111-1111-1111-1111-111111111106', 'Equipment',      'Portable and bookable equipment')
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
insert into public.resources (
  id, name, description, category_id, building, location, capacity, equipment,
  requires_approval, opens_at, closes_at, min_booking_minutes, max_booking_minutes,
  advance_days, is_active
) values
  ('22222222-2222-2222-2222-222222222201', 'Lecture Hall A1',
   'Tiered lecture hall with dual projection and lecture capture.',
   '11111111-1111-1111-1111-111111111101', 'Main Building', 'Ground floor, A1', 180,
   array['Projector','Lecture capture','Whiteboard','Air conditioning'],
   false, '07:00', '21:00', 30, 240, 60, true),

  ('22222222-2222-2222-2222-222222222202', 'Classroom B204',
   'Standard 60-seat classroom for tutorials and lectures.',
   '11111111-1111-1111-1111-111111111101', 'Main Building', 'Second floor, B204', 60,
   array['Projector','Whiteboard'],
   false, '07:00', '22:00', 30, 180, 30, true),

  ('22222222-2222-2222-2222-222222222203', 'Classroom C112',
   'Flexible classroom with movable furniture for group work.',
   '11111111-1111-1111-1111-111111111101', 'Science Block', 'First floor, C112', 45,
   array['Projector','Movable furniture'],
   false, '08:00', '20:00', 30, 180, 30, true),

  ('22222222-2222-2222-2222-222222222204', 'Computer Laboratory 1',
   '40 workstation lab with GPU nodes. Requires supervision and safety induction.',
   '11111111-1111-1111-1111-111111111102', 'Science Block', 'Ground floor, L1', 40,
   array['40 workstations','GPU nodes','Projector','Network access'],
   true, '08:00', '20:00', 60, 300, 30, true),

  ('22222222-2222-2222-2222-222222222205', 'Chemistry Laboratory',
   'Wet lab with fume hoods; bookings require a lab technician on duty.',
   '11111111-1111-1111-1111-111111111102', 'Science Block', 'Second floor, L4', 24,
   array['Fume hoods','Emergency shower','Gas lines'],
   true, '08:00', '18:00', 60, 240, 30, true),

  ('22222222-2222-2222-2222-222222222206', 'Electronics Laboratory',
   'Bench lab with oscilloscopes and soldering stations.',
   '11111111-1111-1111-1111-111111111102', 'Engineering Block', 'Ground floor, E2', 30,
   array['Oscilloscopes','Soldering stations','Bench power supplies'],
   true, '09:00', '19:00', 60, 240, 30, true),

  ('22222222-2222-2222-2222-222222222207', 'Seminar Room S3',
   'Boardroom-style seminar room for up to 25 people.',
   '11111111-1111-1111-1111-111111111103', 'Library', 'Third floor, S3', 25,
   array['Video conferencing','Display','Whiteboard'],
   false, '08:00', '20:00', 30, 180, 45, true),

  ('22222222-2222-2222-2222-222222222208', 'Seminar Room S4',
   'Compact seminar room suited to tutorials and study groups.',
   '11111111-1111-1111-1111-111111111103', 'Library', 'Third floor, S4', 18,
   array['Display','Whiteboard'],
   false, '08:00', '21:00', 30, 120, 30, true),

  ('22222222-2222-2222-2222-222222222209', 'Committee Room M1',
   'Executive meeting room for committees and external visitors.',
   '11111111-1111-1111-1111-111111111104', 'Administration Block', 'First floor, M1', 16,
   array['Video conferencing','Display','Catering point'],
   true, '09:00', '18:00', 30, 180, 60, true),

  ('22222222-2222-2222-2222-222222222210', 'Project Meeting Room M2',
   'Small project room for group work and supervision meetings.',
   '11111111-1111-1111-1111-111111111104', 'Administration Block', 'First floor, M2', 10,
   array['Display','Whiteboard'],
   false, '08:00', '21:00', 30, 120, 30, true),

  ('22222222-2222-2222-2222-222222222211', 'Grand Auditorium',
   '450-seat auditorium with stage lighting and professional audio. Approval required.',
   '11111111-1111-1111-1111-111111111105', 'Arts Centre', 'Main hall', 450,
   array['Stage lighting','Sound system','Projector','Hearing loop'],
   true, '09:00', '22:00', 120, 480, 90, true),

  ('22222222-2222-2222-2222-222222222212', 'Portable Projector 01',
   'Full HD portable projector with HDMI and wireless casting.',
   '11111111-1111-1111-1111-111111111106', 'Media Store', 'Store counter', null,
   array['Full HD','HDMI','Wireless casting'],
   false, '08:00', '18:00', 30, 480, 30, true),

  ('22222222-2222-2222-2222-222222222213', 'Portable PA System',
   'Battery powered public address system for outdoor events.',
   '11111111-1111-1111-1111-111111111106', 'Media Store', 'Store counter', null,
   array['2 microphones','Battery powered','Bluetooth'],
   true, '08:00', '20:00', 60, 480, 30, true),

  ('22222222-2222-2222-2222-222222222214', 'Studio Recording Room',
   'Acoustically treated recording studio. Temporarily out of service.',
   '11111111-1111-1111-1111-111111111106', 'Arts Centre', 'Basement, R1', 6,
   array['Mixing desk','Condenser microphones'],
   true, '10:00', '18:00', 60, 240, 30, false)
on conflict (id) do update
  set name                = excluded.name,
      description         = excluded.description,
      category_id         = excluded.category_id,
      building            = excluded.building,
      location            = excluded.location,
      capacity            = excluded.capacity,
      equipment           = excluded.equipment,
      requires_approval   = excluded.requires_approval,
      opens_at            = excluded.opens_at,
      closes_at           = excluded.closes_at,
      min_booking_minutes = excluded.min_booking_minutes,
      max_booking_minutes = excluded.max_booking_minutes,
      advance_days        = excluded.advance_days,
      is_active           = excluded.is_active;
