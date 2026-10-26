import { useState } from 'react'
import { Check, CheckSquare, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Table, TableWrapper, EmptyTableRow } from '@/components/ui/Table'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getErrorMessage, isUnavailableError } from '@/lib/errors'
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/utils'
import type { BookingWithRelations } from '@/types/models'
import { decideBooking, fetchBookings } from '@/features/bookings/api'

/**
 * Administrator approval queue.
 *
 * Approving re-checks availability inside the database transaction, so two
 * administrators cannot approve overlapping requests for the same resource.
 */
export function ApprovalsPage() {
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<BookingWithRelations | null>(null)
  const [reason, setReason] = useState('')

  const {
    data: pending,
    loading,
    error,
    reload,
  } = useAsyncData('approvals:pending', () => fetchBookings({ status: ['pending'], limit: 200 }))

  const { data: decided, reload: reloadDecided } = useAsyncData('approvals:decided', () =>
    fetchBookings({ status: ['approved', 'rejected'], limit: 20 }),
  )

  const refresh = () => {
    reload()
    reloadDecided()
  }

  const approve = async (booking: BookingWithRelations) => {
    setBusyId(booking.id)
    try {
      await decideBooking(booking.id, 'approved')
      toast.success('Request approved', `${booking.resource?.name ?? 'Resource'} is now reserved.`)
      refresh()
    } catch (err) {
      if (isUnavailableError(err)) {
        toast.error('Slot no longer available', getErrorMessage(err))
      } else {
        toast.error('Could not approve the request', getErrorMessage(err))
      }
    } finally {
      setBusyId(null)
    }
  }

  const reject = async () => {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      await decideBooking(rejecting.id, 'rejected', reason)
      toast.success('Request rejected', 'The requester has been notified.')
      setRejecting(null)
      setReason('')
      refresh()
    } catch (err) {
      toast.error('Could not reject the request', getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const pendingRows = pending ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Review booking requests that need administrator authorisation before a slot is reserved."
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="Awaiting decision"
          description={
            pendingRows.length > 0
              ? `${pendingRows.length} request${pendingRows.length === 1 ? '' : 's'} in the queue`
              : 'Nothing is waiting for review'
          }
          action={
            <Button variant="outline" size="sm" onClick={refresh}>
              Refresh
            </Button>
          }
        />

        {loading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : error ? (
          <CardBody>
            <ErrorState description={error} onRetry={reload} />
          </CardBody>
        ) : pendingRows.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<CheckSquare aria-hidden className="h-5 w-5" />}
              title="No pending requests"
              description="Requests that need approval will appear here as soon as they are submitted."
            />
          </CardBody>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <th scope="col">Requester</th>
                  <th scope="col">Resource</th>
                  <th scope="col">When</th>
                  <th scope="col">Purpose</th>
                  <th scope="col" className="text-right">
                    Decision
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <span className="block font-medium text-content">
                        {booking.profile?.full_name || 'Unknown user'}
                      </span>
                      <span className="mt-0.5 block text-xs text-content-subtle">
                        {booking.profile?.email ?? ''}
                      </span>
                    </td>
                    <td>
                      <span className="block text-content">{booking.resource?.name ?? '—'}</span>
                      <span className="mt-0.5 block text-xs text-content-subtle">
                        {[booking.resource?.building, booking.resource?.location]
                          .filter(Boolean)
                          .join(' · ') || 'Location not specified'}
                      </span>
                    </td>
                    <td>
                      <span className="block text-content">{formatDate(booking.starts_at)}</span>
                      <span className="mt-0.5 block text-xs text-content-subtle">
                        {formatTimeRange(booking.starts_at, booking.ends_at)}
                      </span>
                    </td>
                    <td className="max-w-xs">
                      <span className="line-clamp-2 text-sm text-content-muted">
                        {booking.purpose || '—'}
                      </span>
                      {booking.attendees !== null && (
                        <span className="mt-0.5 block text-xs text-content-subtle">
                          {booking.attendees} attendees
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          loading={busyId === booking.id}
                          onClick={() => approve(booking)}
                          leadingIcon={<Check aria-hidden className="h-3.5 w-3.5" />}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === booking.id}
                          onClick={() => {
                            setReason('')
                            setRejecting(booking)
                          }}
                          leadingIcon={<X aria-hidden className="h-3.5 w-3.5" />}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Recent decisions" description="The 20 most recent approvals and rejections" />
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <th scope="col">Requester</th>
                <th scope="col">Resource</th>
                <th scope="col">When</th>
                <th scope="col">Status</th>
                <th scope="col">Decided</th>
              </tr>
            </thead>
            <tbody>
              {(decided ?? []).length === 0 ? (
                <EmptyTableRow colSpan={5}>No decisions have been recorded yet.</EmptyTableRow>
              ) : (
                (decided ?? []).map((booking) => (
                  <tr key={booking.id}>
                    <td className="text-content">{booking.profile?.full_name || '—'}</td>
                    <td className="text-content">{booking.resource?.name ?? '—'}</td>
                    <td className="text-content-muted">{formatDate(booking.starts_at)}</td>
                    <td>
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="text-content-muted">{formatDateTime(booking.decided_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </Card>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this request?"
        description={
          rejecting
            ? `${rejecting.profile?.full_name ?? 'Requester'} — ${rejecting.resource?.name ?? 'resource'} on ${formatDate(rejecting.starts_at)}`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={Boolean(busyId)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busyId === rejecting?.id}
              disabled={reason.trim().length === 0}
              onClick={reject}
            >
              Reject request
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason for rejection"
          required
          placeholder="Explain why this request cannot be approved."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="The requester sees this note in their booking history and notification."
        />
      </Modal>
    </div>
  )
}
