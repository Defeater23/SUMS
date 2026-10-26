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
