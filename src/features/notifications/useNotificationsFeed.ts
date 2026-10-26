import { useCallback, useEffect, useState } from 'react'
import { useAsyncData } from '@/hooks/useAsyncData'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types/models'
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
} from './api'

/**
 * Live notification feed for the signed-in user.
 *
 * A single Realtime subscription keeps the badge and the list in step with
 * database changes, so notifications reflect real application events.
 */
export function useNotificationsFeed(userId: string | null, limit = 50) {
  const [marking, setMarking] = useState(false)

  const feed = useAsyncData<Notification[]>(
    `notifications:${userId ?? 'anonymous'}:${limit}`,
    () => (userId ? fetchNotifications(userId, { limit }) : Promise.resolve([])),
  )

  const counter = useAsyncData<number>(
    `notifications-unread:${userId ?? 'anonymous'}`,
    () => (userId ? fetchUnreadNotificationCount(userId) : Promise.resolve(0)),
  )

  const { reload: reloadFeed } = feed
  const { reload: reloadCounter } = counter

  useEffect(() => {
    if (!userId) return undefined

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          reloadFeed()
          reloadCounter()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, reloadFeed, reloadCounter])

  const markRead = useCallback(
    async (ids: string[] | null) => {
      setMarking(true)
      try {
        const updated = await markNotificationsRead(ids)
        // Optimistic local update keeps the UI responsive; the realtime event
        // then reconciles against the database.
        feed.setData((current) =>
          (current ?? []).map((notification) =>
            ids === null || ids.includes(notification.id)
              ? { ...notification, is_read: true }
              : notification,
          ),
        )
        await Promise.all([reloadFeed(), reloadCounter()])
        return updated
      } finally {
        setMarking(false)
      }
    },
    [feed, reloadFeed, reloadCounter],
  )

  return {
    notifications: feed.data ?? [],
    unreadCount: counter.data ?? 0,
    loading: feed.loading,
    error: feed.error,
    reload: reloadFeed,
    markRead,
    marking,
  }
}
