import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Clock, MapPin, Pencil, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ActiveBadge, ApprovalBadge, Badge } from '@/components/ui/Badge'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatTime, pluralise, shortTime } from '@/lib/utils'
import { fetchResources, fetchResource, fetchResourceCategories } from './api'
import { fetchResourceAvailability } from '@/features/bookings/api'
import { BookingDialog } from '@/features/bookings/BookingDialog'
import { ResourceFormModal } from './ResourceFormModal'
import { useAppSettings } from '@/features/settings/useAppSettings'

export function ResourceDetailPage() {
  const { resourceId = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin, session } = useAuth()
  const { data: settings } = useAppSettings()

  const [bookingOpen, setBookingOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: resource, loading, error, reload } = useAsyncData(
    `resource:${resourceId}`,
    () => fetchResource(resourceId),
  )
  const { data: categories } = useAsyncData('resource-categories', fetchResourceCategories)
  const { data: activeResources } = useAsyncData('resources:active', () =>
    fetchResources({ activeOnly: true }),
  )

  const windowEnd = useMemo(() => {
    const end = new Date()
    end.setDate(end.getDate() + 14)
    return end
  }, [])

  const {
    data: reservations,
    loading: loadingReservations,
    error: reservationsError,
    reload: reloadReservations,
  } = useAsyncData(`resource-availability:${resourceId}`, () =>
    fetchResourceAvailability(resourceId, new Date().toISOString(), windowEnd.toISOString()),
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof reservations>()
    for (const slot of reservations ?? []) {
      const day = new Date(slot.starts_at).toDateString()
      const list = map.get(day) ?? []
      list.push(slot)
      map.set(day, list)
    }
    return Array.from(map.entries())
  }, [reservations])

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton count={2} />
      </div>
    )
  }

  if (error || !resource) {
    return <ErrorState title="Resource unavailable" description={error ?? undefined} onRetry={reload} />
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/resources')}
          leadingIcon={<ArrowLeft aria-hidden className="h-4 w-4" />}
          className="-ml-2"
        >
          Back to resources
        </Button>
      </div>

      <PageHeader
        title={resource.name}
        description={resource.description ?? 'No description provided.'}
        actions={
          <>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                leadingIcon={<Pencil aria-hidden className="h-4 w-4" />}
              >
                Edit
              </Button>
            )}
            <Button
              onClick={() => setBookingOpen(true)}
              disabled={!resource.is_active}
              leadingIcon={<CalendarPlus aria-hidden className="h-4 w-4" />}
            >
              Book this resource
            </Button>
          </>
        }
      />

      {!resource.is_active && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          This resource is currently inactive and cannot be booked. Existing bookings are unaffected.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {resource.category && <Badge tone="brand">{resource.category.name}</Badge>}
              <ApprovalBadge required={resource.requires_approval} />
              <ActiveBadge active={resource.is_active} />
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Location</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm text-content">
                  <MapPin aria-hidden className="h-4 w-4 text-content-subtle" />
                  {[resource.building, resource.location].filter(Boolean).join(' · ') || 'Not specified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Capacity</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm text-content">
                  <Users aria-hidden className="h-4 w-4 text-content-subtle" />
                  {resource.capacity !== null ? `${resource.capacity} seats` : 'Not specified'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Operating hours</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm text-content">
                  <Clock aria-hidden className="h-4 w-4 text-content-subtle" />
                  {shortTime(resource.opens_at)} – {shortTime(resource.closes_at)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Booking length</dt>
                <dd className="mt-1 text-sm text-content">
                  {resource.min_booking_minutes}–{resource.max_booking_minutes} minutes, up to{' '}
                  {resource.advance_days} days ahead
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Equipment</p>
              {resource.equipment.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {resource.equipment.map((item) => (
                    <li key={item}>
                      <Badge tone="neutral">{item}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-content-muted">No equipment listed.</p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Upcoming reservations"
            description="Next 14 days"
            action={
              <Button variant="ghost" size="sm" onClick={reloadReservations}>
                Refresh
              </Button>
            }
          />
          {loadingReservations ? (
            <CardSkeleton count={1} />
          ) : reservationsError ? (
            <CardBody>
              <ErrorState description={reservationsError} onRetry={reloadReservations} />
            </CardBody>
          ) : grouped.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<CalendarPlus aria-hidden className="h-5 w-5" />}
                title="Nothing booked yet"
                description="This resource is free for the next two weeks."
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {grouped.map(([day, slots]) => (
                <li key={day} className="px-5 py-4 sm:px-6">
                  <p className="text-sm font-semibold text-content">{formatDate(day)}</p>
                  <ul className="mt-2 space-y-1.5">
                    {(slots ?? []).map((slot) => (
                      <li
                        key={slot.booking_id}
                        className="flex items-center justify-between gap-3 text-sm text-content-muted"
                      >
                        <span>
                          {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                        </span>
                        <Badge tone={slot.status === 'completed' ? 'info' : 'success'}>
                          {slot.status === 'completed' ? 'Completed' : 'Reserved'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-5 py-3 text-xs text-content-subtle sm:px-6">
            {reservations?.length ?? 0} {pluralise(reservations?.length ?? 0, 'reservation')} in the
            next 14 days. Pending requests are not shown because they do not hold a slot.
          </div>
        </Card>
      </div>

      <BookingDialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onCreated={() => reloadReservations()}
        resources={activeResources ?? []}
        settings={settings ?? null}
        fixedResourceId={resource.id}
      />

      <ResourceFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={reload}
        resource={resource}
        categories={categories ?? []}
        userId={session?.user?.id ?? null}
      />
    </div>
  )
}
