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
