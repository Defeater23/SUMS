import { supabase } from '@/lib/supabase'
import type { Feedback, FeedbackStatus, FeedbackWithRelations } from '@/types/models'

/**
 * Feedback data access.
 *
 * Users read only their own feedback; administrators read everything. Feedback
 * is created through `submit_feedback()`, which verifies the caller actually
 * booked the resource — a client cannot review a room it never used.
 */

const FEEDBACK_SELECT =
  '*, resource:resources(id,name), profile:profiles(id,full_name,email)'

export interface FeedbackFilters {
  status?: FeedbackStatus
  resourceId?: string
  maxRating?: number
  limit?: number
}

export async function fetchFeedback(
  filters: FeedbackFilters = {},
): Promise<FeedbackWithRelations[]> {
  let query = supabase
    .from('feedback')
    .select(FEEDBACK_SELECT)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 300)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.resourceId) query = query.eq('resource_id', filters.resourceId)
  if (typeof filters.maxRating === 'number') query = query.lte('rating', filters.maxRating)

  const { data, error } = await query.returns<FeedbackWithRelations[]>()
  if (error) throw error
  return data ?? []
}

export interface SubmitFeedbackInput {
  resourceId: string
  bookingId?: string | null
  rating: number
  comment?: string | null
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<Feedback> {
  const { data, error } = await supabase
    .rpc('submit_feedback', {
      p_resource_id: input.resourceId,
      p_rating: input.rating,
      p_comment: input.comment?.trim() || null,
      p_booking_id: input.bookingId || null,
    })
    .returns<Feedback>()

  if (error) throw error
  return data as Feedback
}

export async function reviewFeedback(feedbackId: string, notes?: string | null): Promise<Feedback> {
  const { data, error } = await supabase
    .rpc('review_feedback', { p_feedback_id: feedbackId, p_notes: notes?.trim() || null })
    .returns<Feedback>()

  if (error) throw error
  return data as Feedback
}
