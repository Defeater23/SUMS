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
