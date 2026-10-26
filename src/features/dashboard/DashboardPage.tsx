import { Link } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CheckSquare,
  Clock,
  MessageSquare,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/Badge'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatDateTime, formatDuration, formatTimeRange, percentage } from '@/lib/utils'
import {
  fetchAdminDashboardStats,
  fetchFeedbackSummary,
  fetchMyDashboardStats,
} from '@/features/analytics/api'
import { fetchBookings } from '@/features/bookings/api'
import { fetchResources } from '@/features/resources/api'

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

export function DashboardPage() {
  const { profile, isAdmin } = useAuth()

  const {
    data: mine,
    loading: loadingMine,
    error: errorMine,
    reload: reloadMine,
  } = useAsyncData('dashboard:mine', fetchMyDashboardStats)

  const { data: adminStats, loading: loadingAdmin } = useAsyncData(
    isAdmin ? 'dashboard:admin' : 'dashboard:admin:skipped',
    () => (isAdmin ? fetchAdminDashboardStats() : Promise.resolve(null)),
  )

  const { data: recentBookings, loading: loadingRecent } = useAsyncData('dashboard:recent', () =>
    fetchBookings({ limit: 6 }),
  )

  const { data: activeResources } = useAsyncData('dashboard:resources', () =>
    fetchResources({ activeOnly: true }),
  )

  const { data: feedbackSummary } = useAsyncData(
    isAdmin ? 'dashboard:feedback' : 'dashboard:feedback:skipped',
    () => (isAdmin ? fetchFeedbackSummary() : Promise.resolve(null)),
  )

  const upcoming = (recentBookings ?? []).filter(
    (booking) => new Date(booking.starts_at).getTime() > Date.now() && booking.status !== 'cancelled',
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}`}
        description={
          isAdmin
            ? 'Institution-wide activity, approvals and resource utilisation.'
            : 'Your bookings, requests and available resources at a glance.'
        }
        actions={
          isAdmin ? (
            <>
              <Link to="/approvals">
                <Button variant="outline" leadingIcon={<CheckSquare aria-hidden className="h-4 w-4" />}>
                  Approvals
                </Button>
              </Link>
              <Link to="/resources">
                <Button leadingIcon={<CalendarPlus aria-hidden className="h-4 w-4" />}>
                  Book a resource
                </Button>
              </Link>
            </>
          ) : (
            <Link to="/resources">
              <Button leadingIcon={<CalendarPlus aria-hidden className="h-4 w-4" />}>
                Book a resource
              </Button>
            </Link>
          )
        }
      />

      {isAdmin ? (
        loadingAdmin ? (
          <CardSkeleton count={4} />
        ) : adminStats ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active resources"
              value={adminStats.active_resources}
              hint={`${adminStats.total_resources} in the catalogue · ${adminStats.inactive_resources} inactive`}
              icon={<Building2 aria-hidden className="h-5 w-5" />}
            />
            <StatCard
              label="Total bookings"
              value={adminStats.total_bookings}
              hint={`${adminStats.bookings_last_7_days} created in the last 7 days`}
              icon={<CalendarDays aria-hidden className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label="Pending approvals"
              value={adminStats.pending_approvals}
              hint={adminStats.upcoming_bookings ? `${adminStats.upcoming_bookings} upcoming bookings` : 'Nothing awaiting review'}
              icon={<CheckSquare aria-hidden className="h-5 w-5" />}
              tone={adminStats.pending_approvals > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Users"
              value={adminStats.total_users}
              hint={`${adminStats.active_users} active accounts`}
              icon={<Users aria-hidden className="h-5 w-5" />}
              tone="neutral"
            />
          </div>
        ) : null
      ) : loadingMine ? (
        <CardSkeleton count={4} />
      ) : errorMine ? (
        <ErrorState description={errorMine} onRetry={reloadMine} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Upcoming bookings"
            value={mine?.upcoming_count ?? 0}
            hint={
              mine?.next_booking_at
                ? `Next: ${formatDateTime(mine.next_booking_at)}`
                : 'Nothing scheduled yet'
            }
            icon={<CalendarCheck aria-hidden className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Pending requests"
            value={mine?.pending_count ?? 0}
            hint="Awaiting administrator review"
            icon={<Clock aria-hidden className="h-5 w-5" />}
            tone={mine && mine.pending_count > 0 ? 'warning' : 'neutral'}
          />
          <StatCard
            label="Approved"
            value={mine?.approved_count ?? 0}
            hint={`${mine?.completed_count ?? 0} completed`}
            icon={<CheckSquare aria-hidden className="h-5 w-5" />}
          />
          <StatCard
            label="Unread notifications"
            value={mine?.unread_notifications ?? 0}
            hint="Booking updates and decisions"
            icon={<Bell aria-hidden className="h-5 w-5" />}
            tone="info"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title={isAdmin ? 'Recent bookings' : 'Your recent bookings'}
            description="Live records from the bookings table"
            action={
              <Link to="/bookings">
                <Button variant="ghost" size="sm">
                  View all
                </Button>
              </Link>
            }
          />

          {loadingRecent ? (
            <CardSkeleton count={1} />
          ) : !recentBookings || recentBookings.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<CalendarDays aria-hidden className="h-5 w-5" />}
                title="No bookings yet"
                description="Bookings you create will appear here with their current status."
                action={
                  <Link to="/resources">
                    <Button size="sm">Browse resources</Button>
                  </Link>
                }
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {recentBookings.map((booking) => (
                <li key={booking.id} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">
                      {booking.resource?.name ?? 'Resource removed'}
                    </p>
                    <p className="mt-0.5 text-xs text-content-muted">
                      {formatDate(booking.starts_at)} · {formatTimeRange(booking.starts_at, booking.ends_at)} ·{' '}
                      {formatDuration(minutesBetween(booking.starts_at, booking.ends_at))}
                      {isAdmin && booking.profile?.full_name ? ` · ${booking.profile.full_name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {isAdmin && adminStats && (
            <Card>
              <CardHeader title="Utilisation" description="Last 7 days" />
              <CardBody className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-content-muted">Resource utilisation</span>
                    <span className="font-semibold text-content">
                      {adminStats.utilization_last_7d !== null
                        ? `${adminStats.utilization_last_7d}%`
                        : 'No bookings'}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all"
                      style={{ width: `${Math.min(100, adminStats.utilization_last_7d ?? 0)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-content-muted">Average decision time</span>
                  <span className="font-semibold text-content">
                    {adminStats.avg_decision_hours !== null
                      ? `${adminStats.avg_decision_hours} h`
                      : 'Not enough data'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-content-muted">Open feedback</span>
                  <span className="font-semibold text-content">
                    {feedbackSummary?.open_feedback ?? adminStats.open_feedback}
                  </span>
                </div>
                <Link to="/analytics">
                  <Button variant="outline" size="sm" fullWidth leadingIcon={<BarChart3 aria-hidden className="h-4 w-4" />}>
                    Open analytics
                  </Button>
                </Link>
              </CardBody>
            </Card>
          )}

          {!isAdmin && mine && (
            <Card>
              <CardHeader title="Your activity" description="All-time totals" />
              <CardBody className="space-y-3">
                {(
                  [
                    ['Approved', mine.approved_count, 'success'],
                    ['Pending', mine.pending_count, 'warning'],
                    ['Completed', mine.completed_count, 'info'],
                    ['Cancelled', mine.cancelled_count, 'neutral'],
                    ['Rejected', mine.rejected_count, 'danger'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-content-muted">
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${
                          tone === 'success'
                            ? 'bg-emerald-500'
                            : tone === 'warning'
                              ? 'bg-amber-500'
                              : tone === 'info'
                                ? 'bg-sky-500'
                                : tone === 'danger'
                                  ? 'bg-red-500'
                                  : 'bg-slate-400'
                        }`}
                      />
                      {label}
                    </span>
                    <span className="font-semibold text-content">{value}</span>
                  </div>
                ))}
                <div className="border-t border-line pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-content-muted">Total bookings</span>
                    <span className="font-semibold text-content">{mine.total_count}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${percentage(mine.approved_count + mine.completed_count, mine.total_count)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-content-subtle">
                    {percentage(mine.approved_count + mine.completed_count, mine.total_count)}% of your
                    bookings were approved or completed.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Available resources" />
            <CardBody className="space-y-4">
              <p className="text-3xl font-semibold text-content">{activeResources?.length ?? 0}</p>
              <p className="text-sm text-content-muted">
                Classrooms, laboratories, seminar rooms, meeting rooms and equipment currently open for
                booking.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/resources">
                  <Button variant="outline" size="sm" leadingIcon={<Building2 aria-hidden className="h-4 w-4" />}>
                    Browse catalogue
                  </Button>
                </Link>
                <Link to="/feedback">
                  <Button variant="ghost" size="sm" leadingIcon={<MessageSquare aria-hidden className="h-4 w-4" />}>
                    Give feedback
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {isAdmin && upcoming.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Coming up" description="Next confirmed reservations across the institution" />
          <ul className="divide-y divide-line">
            {upcoming.slice(0, 5).map((booking) => (
              <li key={booking.id} className="flex items-start gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">
                    {booking.resource?.name ?? 'Resource removed'}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {formatDateTime(booking.starts_at)} · {booking.profile?.full_name ?? 'Unknown user'}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
