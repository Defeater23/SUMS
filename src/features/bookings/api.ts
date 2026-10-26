import { supabase } from '@/lib/supabase'
import type {
  AvailabilitySlot,
  Booking,
  BookingStatus,
  BookingWithRelations,
} from '@/types/models'

/**
 * Booking data access.
 *
 * There are no insert/update/delete policies on `bookings`: every state change
 * goes through a SECURITY DEFINER function that validates the request, checks
 * authorisation and relies on the GiST exclusion constraint to prevent
 * overlapping reservations. This module only wraps those RPCs.
 */

const BOOKING_SELECT =
  '*, resource:resources(id,name,building,location,requires_approval), profile:profiles(id,full_name,email,department,role)'

export interface BookingFilters {
  status?: BookingStatus[]
  resourceId?: string
  /** Inclusive lower bound on `starts_at`. */
  from?: string
  /** Exclusive upper bound on `starts_at`. */
  to?: string
  limit?: number
}

export async function fetchBookings(filters: BookingFilters = {}): Promise<BookingWithRelations[]> {
  let query = supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .order('starts_at', { ascending: false })
    .limit(filters.limit ?? 500)

  if (filters.status?.length) query = query.in('status', filters.status)
  if (filters.resourceId) query = query.eq('resource_id', filters.resourceId)
  if (filters.from) query = query.gte('starts_at', filters.from)
  if (filters.to) query = query.lt('starts_at', filters.to)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as BookingWithRelations[]
}

export async function fetchBooking(id: string): Promise<BookingWithRelations> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('That booking could not be found.')
  return data as BookingWithRelations
}

export interface CreateBookingInput {
  resourceId: string
  startsAt: string
  endsAt: string
  purpose?: string | null
  attendees?: number | null
}

/** Creates a booking. Overlap races surface as a friendly 23P01/P0001 error. */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { data, error } = await supabase
    .rpc('create_booking', {
      p_resource_id: input.resourceId,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_purpose: input.purpose?.trim() || null,
      p_attendees: input.attendees ?? null,
    })

  if (error) throw error
  return data as Booking
}

export async function cancelBooking(bookingId: string, reason?: string | null): Promise<Booking> {
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason?.trim() || null,
  })

  if (error) throw error
  return data as Booking
}

/** Administrator decision. Availability is re-checked inside the transaction. */
export async function decideBooking(
  bookingId: string,
  decision: Extract<BookingStatus, 'approved' | 'rejected'>,
  reason?: string | null,
): Promise<Booking> {
  const { data, error } = await supabase
    .rpc('decide_booking', {
      p_booking_id: bookingId,
      p_decision: decision,
      p_reason: reason?.trim() || null,
    })

  if (error) throw error
  return data as Booking
}

/**
 * Blocking reservations for a resource — deliberately returns no personal data
 * so any signed-in user can see when a room is taken.
 */
export async function fetchResourceAvailability(
  resourceId: string,
  from: string,
  to: string,
): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .rpc('get_resource_availability', {
      p_resource_id: resourceId,
      p_from: from,
      p_to: to,
    })

  if (error) throw error
  return (data ?? []) as AvailabilitySlot[]
}

/** Housekeeping: marks finished approved bookings as completed. */
export async function completePastBookings(): Promise<number> {
  const { data, error } = await supabase.rpc('complete_past_bookings')
  if (error) throw error
  return (data ?? 0) as number
}
