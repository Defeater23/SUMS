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
