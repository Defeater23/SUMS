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
