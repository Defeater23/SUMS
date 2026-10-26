import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types/models'

/**
 * Notification data access.
 *
 * Every query relies on Row Level Security: the database only ever returns the
 * signed-in user's rows, so a user can never read another user's notifications
 * even if the filter below were removed.
 */

export async function fetchNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)

  if (options.unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Notification[]
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count ?? 0
}

/** Marks the given notifications as read, or every unread one when `ids` is null. */
export async function markNotificationsRead(ids: string[] | null = null): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids })
  if (error) throw error
  return (data as number | null) ?? 0
}
