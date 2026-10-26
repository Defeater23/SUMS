import { Link } from 'react-router-dom'
import { Bell, BellRing, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { cn, formatRelative } from '@/lib/utils'
import { useNotificationsFeed } from './useNotificationsFeed'

export function NotificationsPage() {
  const { session } = useAuth()
  const toast = useToast()

  const { notifications, unreadCount, loading, error, reload, markRead, marking } =
    useNotificationsFeed(session?.user?.id ?? null, 100)

  const handleMarkAll = async () => {
    try {
      const updated = await markRead(null)
      toast.success('All caught up', `${updated} notification${updated === 1 ? '' : 's'} marked as read.`)
    } catch (err) {
      toast.error('Could not update notifications', getErrorMessage(err))
    }
  }

  const handleMarkOne = async (id: string) => {
    try {
      await markRead([id])
    } catch (err) {
      toast.error('Could not update the notification', getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates about your bookings, approvals and cancellations — generated from real events."
        actions={
          <Button
            variant="outline"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || marking}
            leadingIcon={<CheckCheck aria-hidden className="h-4 w-4" />}
          >
            Mark all as read
          </Button>
        }
      >
        {unreadCount > 0 && (
          <p className="mt-2">
            <Badge tone="brand">{unreadCount} unread</Badge>
          </p>
        )}
      </PageHeader>

      <Card className="overflow-hidden">
        {loading ? (
          <CardBody className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </CardBody>
        ) : error ? (
          <CardBody>
            <ErrorState description={error} onRetry={reload} />
          </CardBody>
        ) : notifications.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Bell aria-hidden className="h-5 w-5" />}
              title="No notifications yet"
              description="You will be notified here when your bookings are created, approved, rejected or cancelled."
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-4 sm:px-6',
                  !notification.is_read && 'bg-brand-50/60 dark:bg-brand-500/10',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    notification.is_read
                      ? 'bg-surface-muted text-content-subtle'
                      : 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
                  )}
                >
                  <BellRing className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-content">{notification.title}</p>
                    {!notification.is_read && <Badge tone="brand">New</Badge>}
                  </div>
                  {notification.body && (
                    <p className="mt-1 text-sm text-content-muted">{notification.body}</p>
                  )}
                  <p className="mt-1 text-xs text-content-subtle">
                    {formatRelative(notification.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {notification.booking_id && (
                    <Link to="/bookings">
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  )}
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={marking}
                      onClick={() => handleMarkOne(notification.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
