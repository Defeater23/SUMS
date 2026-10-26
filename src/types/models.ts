/**
 * Domain models for SUMS.
 *
 * These mirror the PostgreSQL schema in `supabase/migrations`. They are the
 * single source of truth for the shapes used across the frontend, and are
 * applied at the Supabase query boundary via `.returns<T>()`.
 */

export type UserRole = 'student' | 'faculty' | 'admin'

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed'

export type NotificationType =
  | 'booking_created'
  | 'booking_approved'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'booking_updated'

export type FeedbackStatus = 'open' | 'reviewed'

export interface Profile {
  id: string
  email: string
  full_name: string
  department: string | null
  phone: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ResourceCategory {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Resource {
  id: string
  name: string
  description: string | null
  category_id: string | null
  building: string | null
  location: string | null
  capacity: number | null
  equipment: string[]
  image_url: string | null
  requires_approval: boolean
  opens_at: string
  closes_at: string
  min_booking_minutes: number
  max_booking_minutes: number
  advance_days: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A resource row joined with its category name (used by list/detail views). */
export interface ResourceWithCategory extends Resource {
  category: Pick<ResourceCategory, 'id' | 'name'> | null
}

export interface Booking {
  id: string
  resource_id: string
  user_id: string
  starts_at: string
  ends_at: string
  purpose: string | null
  attendees: number | null
  status: BookingStatus
  decision_reason: string | null
  decided_by: string | null
  decided_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

/** Booking enriched for display: resource details plus the requester. */
export interface BookingWithRelations extends Booking {
  resource: Pick<Resource, 'id' | 'name' | 'building' | 'location' | 'requires_approval'> | null
  profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'department' | 'role'> | null
}

export interface Notification {
  id: string
  user_id: string
  booking_id: string | null
  type: NotificationType
  title: string
  body: string | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

export interface Feedback {
  id: string
  user_id: string
  resource_id: string
  booking_id: string | null
  rating: number
  comment: string | null
  status: FeedbackStatus
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface FeedbackWithRelations extends Feedback {
  resource: Pick<Resource, 'id' | 'name'> | null
  profile: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export interface AuditEvent {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AppSettings {
  id: boolean
  institution_name: string
  timezone: string
  booking_open_hour: number
  booking_close_hour: number
  allow_weekends: boolean
  min_lead_time_minutes: number
  cancellation_cutoff_mins: number
  slot_granularity_mins: number
  auto_approve_roles: UserRole[]
  updated_at: string
}

// ---------------------------------------------------------------------------
// Analytics / aggregate result shapes
// ---------------------------------------------------------------------------

export interface MyDashboardStats {
  upcoming_count: number
  pending_count: number
  approved_count: number
  completed_count: number
  cancelled_count: number
  rejected_count: number
  total_count: number
  unread_notifications: number
  next_booking_at: string | null
}

export interface AdminDashboardStats {
  total_resources: number
  active_resources: number
  inactive_resources: number
  total_bookings: number
  pending_approvals: number
  upcoming_bookings: number
  bookings_last_7_days: number
  total_users: number
  active_users: number
  open_feedback: number
  avg_decision_hours: number | null
  utilization_last_7d: number | null
}

export interface BookingTrendPoint {
  day: string
  created: number
  approved: number
  rejected: number
  cancelled: number
  completed: number
}

export interface StatusDistributionPoint {
  status: BookingStatus
  total: number
}

export interface CategoryDistributionPoint {
  category: string
  total: number
}

export interface TopResourcePoint {
  resource_id: string
  resource_name: string
  category: string
  booking_count: number
  booked_minutes: number
}

export interface ResourceUtilizationPoint {
  resource_id: string
  resource_name: string
  category: string
  building: string | null
  capacity: number | null
  booking_count: number
  booked_minutes: number
  available_minutes: number
  utilization_pct: number
}

export interface DecisionTrendPoint {
  day: string
  approved: number
  rejected: number
  decided: number
  approval_rate: number | null
}

export interface FeedbackSummary {
  total_feedback: number
  average_rating: number | null
  open_feedback: number
  reviewed_feedback: number
  low_rating_count: number
}

export interface AvailabilitySlot {
  booking_id: string
  starts_at: string
  ends_at: string
  status: BookingStatus
}
