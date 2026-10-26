import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, Eye, Ban } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { Table, TableWrapper, SortableHeader } from '@/components/ui/Table'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useTableState } from '@/hooks/useTableState'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatDateTime, formatDuration, formatTimeRange } from '@/lib/utils'
import type { BookingStatus, BookingWithRelations } from '@/types/models'
import { cancelBooking, fetchBookings } from './api'
import { BookingDialog } from './BookingDialog'
import { fetchResources } from '@/features/resources/api'
import { useAppSettings } from '@/features/settings/useAppSettings'

type BookingTab = 'all' | BookingStatus

const TABS: Array<{ value: BookingTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

export function BookingsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const { data: settings } = useAppSettings()

  const { data: bookings, loading, error, reload } = useAsyncData('bookings:all', () =>
    fetchBookings({ limit: 500 }),
  )
  const { data: activeResources } = useAsyncData('resources:active', () =>
    fetchResources({ activeOnly: true }),
  )

  const [tab, setTab] = useState<BookingTab>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelling, setCancelling] = useState<BookingWithRelations | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [working, setWorking] = useState(false)
  const [detail, setDetail] = useState<BookingWithRelations | null>(null)

  const rows = bookings ?? []

  const counts = useMemo(() => {
    const result: Record<BookingTab, number> = {
      all: rows.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      completed: 0,
    }
    for (const booking of rows) result[booking.status] += 1
    return result
  }, [rows])

  const predicate = useCallback(
    (booking: BookingWithRelations) => tab === 'all' || booking.status === tab,
    [tab],
  )

  const table = useTableState<BookingWithRelations>(rows, {
    searchText: (booking) =>
      [booking.resource?.name, booking.purpose, booking.profile?.full_name, booking.profile?.email]
        .filter(Boolean)
        .join(' '),
    sorters: {
      resource: (booking) => booking.resource?.name ?? null,
      starts_at: (booking) => new Date(booking.starts_at),
      status: (booking) => booking.status,
      created_at: (booking) => new Date(booking.created_at),
    },
    predicate,
    initialSortKey: 'starts_at',
    initialDirection: 'desc',
  })

  /** Mirrors the database rule so users get immediate, honest feedback. */
  const canCancel = (booking: BookingWithRelations) => {
    if (booking.status !== 'pending' && booking.status !== 'approved') return false
    if (booking.status === 'approved' && !isAdmin && settings) {
      const cutoff = new Date(booking.starts_at).getTime() - settings.cancellation_cutoff_mins * 60_000
      if (Date.now() > cutoff) return false
    }
    return true
  }

  const handleCancel = async () => {
    if (!cancelling) return
    setWorking(true)
    try {
      await cancelBooking(cancelling.id, cancelReason)
      toast.success('Booking cancelled', 'The slot has been released.')
      setCancelling(null)
      setCancelReason('')
      reload()
    } catch (err) {
      toast.error('Could not cancel the booking', getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const tabItems: TabItem<BookingTab>[] = TABS.map((item) => ({
    value: item.value,
    label: item.label,
    count: counts[item.value],
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description={
          isAdmin
            ? 'Every booking across the institution, with live status and approval outcomes.'
            : 'Your booking history, including outstanding requests and cancellations.'
        }
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            leadingIcon={<CalendarPlus aria-hidden className="h-4 w-4" />}
          >
            New booking
          </Button>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Tabs items={tabItems} value={tab} onChange={setTab} ariaLabel="Filter bookings by status" />
        </div>

        <div className="border-b border-line px-5 py-4 sm:px-6">
          <SearchInput
            value={table.query}
            onChange={table.setQuery}
            placeholder="Search by resource, purpose or requester"
            label="Search bookings"
            className="max-w-md"
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : error ? (
          <div className="p-5">
            <ErrorState description={error} onRetry={reload} />
          </div>
        ) : table.filteredCount === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<CalendarDays aria-hidden className="h-5 w-5" />}
              title={rows.length === 0 ? 'No bookings yet' : 'No bookings match this view'}
              description={
                rows.length === 0
                  ? 'Create a booking to reserve a classroom, laboratory or piece of equipment.'
                  : 'Try another status tab or clear the search box.'
              }
              action={
                rows.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)}>Create a booking</Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <SortableHeader sortKey="resource" activeKey={table.sortKey} direction={table.direction} onSort={table.toggleSort}>
                      Resource
                    </SortableHeader>
                    <SortableHeader sortKey="starts_at" activeKey={table.sortKey} direction={table.direction} onSort={table.toggleSort}>
                      When
                    </SortableHeader>
                    {isAdmin && <th scope="col">Requested by</th>}
                    <SortableHeader sortKey="status" activeKey={table.sortKey} direction={table.direction} onSort={table.toggleSort}>
                      Status
                    </SortableHeader>
                    <th scope="col" className="text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.pageRows.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <span className="block font-medium text-content">
                          {booking.resource?.name ?? 'Resource removed'}
                        </span>
                        <span className="mt-0.5 block text-xs text-content-subtle">
                          {[booking.resource?.building, booking.resource?.location].filter(Boolean).join(' · ') ||
                            'Location not specified'}
                        </span>
                      </td>
                      <td>
                        <span className="block text-content">{formatDate(booking.starts_at)}</span>
                        <span className="mt-0.5 block text-xs text-content-subtle">
                          {formatTimeRange(booking.starts_at, booking.ends_at)} ·{' '}
                          {formatDuration(minutesBetween(booking.starts_at, booking.ends_at))}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <span className="block text-content">{booking.profile?.full_name || '—'}</span>
                          <span className="mt-0.5 block text-xs text-content-subtle">
                            {booking.profile?.email ?? ''}
                          </span>
                        </td>
                      )}
                      <td>
                        <StatusBadge status={booking.status} />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="View booking details"
                            onClick={() => setDetail(booking)}
                          >
                            <Eye aria-hidden className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canCancel(booking)}
                            title={
                              canCancel(booking)
                                ? 'Cancel this booking'
                                : booking.status === 'approved'
                                  ? 'Approved bookings can only be cancelled before the cut-off'
                                  : 'This booking can no longer be cancelled'
                            }
                            aria-label="Cancel booking"
                            onClick={() => {
                              setCancelReason('')
                              setCancelling(booking)
                            }}
                          >
                            <Ban aria-hidden className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>

            <Pagination
              page={table.page}
              pageSize={table.pageSize}
              total={table.filteredCount}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
            />
          </>
        )}
      </div>

      <BookingDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
        resources={activeResources ?? []}
        settings={settings ?? null}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this booking?"
        description={
          cancelling
            ? `${cancelling.resource?.name ?? 'Resource'} on ${formatDate(cancelling.starts_at)}`
            : undefined
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        destructive
        loading={working}
        onCancel={() => setCancelling(null)}
        onConfirm={handleCancel}
      >
        <div className="space-y-2">
          <Textarea
            label="Reason (optional)"
            placeholder="Let the administrator know why you are cancelling."
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
          />
          <p className="text-xs text-content-subtle">
            Cancelling releases the slot immediately. This cannot be undone.
          </p>
        </div>
      </ConfirmDialog>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Booking details"
        description={detail?.resource?.name ?? undefined}
        size="md"
      >
        {detail && (
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-muted">Status</dt>
              <dd>
                <StatusBadge status={detail.status} />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-muted">When</dt>
              <dd className="text-right text-content">
                {formatDate(detail.starts_at)}
                <span className="block text-xs text-content-subtle">
                  {formatTimeRange(detail.starts_at, detail.ends_at)}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-muted">Location</dt>
              <dd className="text-right text-content">
                {[detail.resource?.building, detail.resource?.location].filter(Boolean).join(' · ') ||
                  'Not specified'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-muted">Attendees</dt>
              <dd className="text-content">{detail.attendees ?? 'Not specified'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-content-muted">Requested</dt>
              <dd className="text-content">{formatDateTime(detail.created_at)}</dd>
            </div>
            {detail.purpose && (
              <div>
                <dt className="text-content-muted">Purpose</dt>
                <dd className="mt-1 text-content">{detail.purpose}</dd>
              </div>
            )}
            {detail.decision_reason && (
              <div>
                <dt className="text-content-muted">Decision note</dt>
                <dd className="mt-1 text-content">{detail.decision_reason}</dd>
              </div>
            )}
            {detail.resource?.requires_approval && (
              <div className="pt-1">
                <Badge tone="warning">This resource requires administrator approval</Badge>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </div>
  )
}
