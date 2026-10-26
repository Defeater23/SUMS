import { useCallback, useMemo, useState } from 'react'
import { MessageSquare, MessageSquarePlus, Star } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Select, Textarea } from '@/components/ui/Field'
import { Table, TableWrapper } from '@/components/ui/Table'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { Badge } from '@/components/ui/Badge'
import { Rating, RatingInput } from '@/components/ui/Avatar'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useTableState } from '@/hooks/useTableState'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import type { FeedbackStatus, FeedbackWithRelations } from '@/types/models'
import { fetchBookings } from '@/features/bookings/api'
import { fetchFeedback, reviewFeedback, submitFeedback } from './api'
import { fetchFeedbackSummary } from '@/features/analytics/api'

type StatusTab = 'all' | FeedbackStatus

export function FeedbackPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()

  const { data: feedback, loading, error, reload } = useAsyncData('feedback:list', () =>
    fetchFeedback({ limit: 300 }),
  )

  const { data: summary } = useAsyncData(
    isAdmin ? 'feedback:summary' : 'feedback:summary:skipped',
    () => (isAdmin ? fetchFeedbackSummary() : Promise.resolve(null)),
  )

  const { data: eligibleBookings } = useAsyncData('feedback:eligible-bookings', () =>
    fetchBookings({ status: ['approved', 'completed'], limit: 200 }),
  )

  const [submitOpen, setSubmitOpen] = useState(false)
  const [resourceId, setResourceId] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const [reviewing, setReviewing] = useState<FeedbackWithRelations | null>(null)
  const [notes, setNotes] = useState('')

  const [tab, setTab] = useState<StatusTab>('all')
  const [lowOnly, setLowOnly] = useState(false)

  const rows = feedback ?? []

  const resourceOptions = useMemo(() => {
    const seen = new Map<string, { value: string; label: string }>()
    for (const booking of eligibleBookings ?? []) {
      if (!booking.resource || seen.has(booking.resource.id)) continue
      seen.set(booking.resource.id, { value: booking.resource.id, label: booking.resource.name })
    }
    return Array.from(seen.values())
  }, [eligibleBookings])

  const predicate = useCallback(
    (item: FeedbackWithRelations) => {
      if (tab !== 'all' && item.status !== tab) return false
      if (lowOnly && item.rating > 2) return false
      return true
    },
    [tab, lowOnly],
  )

  const table = useTableState<FeedbackWithRelations>(rows, {
    searchText: (item) =>
      [item.resource?.name, item.comment, item.profile?.full_name].filter(Boolean).join(' '),
    sorters: {
      resource: (item) => item.resource?.name ?? null,
      rating: (item) => item.rating,
      created_at: (item) => new Date(item.created_at),
      status: (item) => item.status,
    },
    predicate,
    initialSortKey: 'created_at',
    initialDirection: 'desc',
  })

  const counts = useMemo(() => {
    return {
      all: rows.length,
      open: rows.filter((item) => item.status === 'open').length,
      reviewed: rows.filter((item) => item.status === 'reviewed').length,
    }
  }, [rows])

  const handleSubmit = async () => {
    if (!resourceId || rating < 1) return
    setSaving(true)
    try {
      // The server resolves the underlying booking and refuses resources the
      // user has never booked.
      await submitFeedback({ resourceId, rating, comment })
      toast.success('Thanks for the feedback', 'Your comments help improve campus facilities.')
      setSubmitOpen(false)
      setResourceId('')
      setRating(0)
      setComment('')
      reload()
    } catch (err) {
      toast.error('Could not submit feedback', getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async () => {
    if (!reviewing) return
    setSaving(true)
    try {
      await reviewFeedback(reviewing.id, notes)
      toast.success('Feedback marked as reviewed')
      setReviewing(null)
      setNotes('')
      reload()
    } catch (err) {
      toast.error('Could not update the feedback', getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const tabItems: TabItem<StatusTab>[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'open', label: 'Open', count: counts.open },
    { value: 'reviewed', label: 'Reviewed', count: counts.reviewed },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description={
          isAdmin
            ? 'Review feedback submitted by students and faculty and identify recurring issues.'
            : 'Share how your bookings went. You can give feedback for resources you have used.'
        }
        actions={
          !isAdmin ? (
            <Button
              onClick={() => setSubmitOpen(true)}
              disabled={resourceOptions.length === 0}
              leadingIcon={<MessageSquarePlus aria-hidden className="h-4 w-4" />}
            >
              Submit feedback
            </Button>
          ) : null
        }
      />

      {isAdmin && summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total entries" value={summary.total_feedback} icon={<MessageSquare aria-hidden className="h-5 w-5" />} />
          <StatCard
            label="Average rating"
            value={summary.average_rating !== null ? `${summary.average_rating} / 5` : '—'}
            icon={<Star aria-hidden className="h-5 w-5" />}
            tone="info"
          />
          <StatCard label="Awaiting review" value={summary.open_feedback} tone={summary.open_feedback > 0 ? 'warning' : 'success'} />
          <StatCard label="Low ratings (≤2)" value={summary.low_rating_count} tone={summary.low_rating_count > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      {!isAdmin && resourceOptions.length === 0 && (
        <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-content-muted">
          You can give feedback once you have an approved or completed booking.
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title={isAdmin ? 'All feedback' : 'Your feedback'}
          description={isAdmin ? 'Newest first' : 'Everything you have submitted'}
          action={
            isAdmin ? (
              <label className="flex items-center gap-2 text-sm text-content-muted">
                <input
                  type="checkbox"
                  checked={lowOnly}
                  onChange={(event) => setLowOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500/40"
                />
                Low ratings only
              </label>
            ) : undefined
          }
        />

        <div className="border-b border-line px-5 py-3 sm:px-6">
          <Tabs items={tabItems} value={tab} onChange={setTab} ariaLabel="Filter feedback by status" />
        </div>

        {loading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : error ? (
          <div className="p-5">
            <ErrorState description={error} onRetry={reload} />
          </div>
        ) : table.filteredCount === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<MessageSquare aria-hidden className="h-5 w-5" />}
              title={rows.length === 0 ? 'No feedback yet' : 'No feedback matches this view'}
              description={
                rows.length === 0
                  ? isAdmin
                    ? 'Feedback submitted by students and faculty will appear here.'
                    : 'After using a resource you can share your experience here.'
                  : 'Try another tab or clear the low-ratings filter.'
              }
            />
          </div>
        ) : (
          <>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th scope="col">Resource</th>
                    {isAdmin && <th scope="col">Submitted by</th>}
                    <th scope="col">Rating</th>
                    <th scope="col">Comment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                    {isAdmin && (
                      <th scope="col" className="text-right">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {table.pageRows.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium text-content">{item.resource?.name ?? '—'}</td>
                      {isAdmin && (
                        <td>
                          <span className="block text-content">{item.profile?.full_name || '—'}</span>
                          <span className="mt-0.5 block text-xs text-content-subtle">
                            {item.profile?.email ?? ''}
                          </span>
                        </td>
                      )}
                      <td>
                        <Rating value={item.rating} size="sm" />
                      </td>
                      <td className="max-w-sm">
                        <span className="line-clamp-2 text-sm text-content-muted">
                          {item.comment || '—'}
                        </span>
                      </td>
                      <td>
                        <Badge tone={item.status === 'reviewed' ? 'success' : 'warning'}>
                          {item.status === 'reviewed' ? 'Reviewed' : 'Open'}
                        </Badge>
                      </td>
                      <td className="text-content-muted">{formatDate(item.created_at)}</td>
                      {isAdmin && (
                        <td>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={item.status === 'reviewed'}
                              onClick={() => {
                                setNotes(item.admin_notes ?? '')
                                setReviewing(item)
                              }}
                            >
                              {item.status === 'reviewed' ? 'Reviewed' : 'Mark reviewed'}
                            </Button>
                          </div>
                        </td>
                      )}
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
      </Card>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit feedback"
        description="Feedback is tied to a resource you have booked."
        footer={
          <>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              loading={saving}
              disabled={!resourceId || rating < 1}
              onClick={handleSubmit}
            >
              Submit feedback
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Resource"
            required
            placeholder="Choose a resource you have used"
            options={resourceOptions}
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
          />

          <div>
            <p className="field-label">Rating</p>
            <RatingInput value={rating} onChange={setRating} />
            {rating < 1 && <p className="field-hint">Choose a rating between 1 and 5.</p>}
          </div>

          <Textarea
            label="Comment"
            placeholder="What worked well? What could be improved?"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Review feedback"
        description={reviewing?.resource?.name ?? undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleReview}>
              Save review notes
            </Button>
          </>
        }
      >
        {reviewing && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-muted px-4 py-3">
              <Rating value={reviewing.rating} size="sm" />
              <p className="mt-2 text-sm text-content">{reviewing.comment || 'No comment provided.'}</p>
              <p className="mt-2 text-xs text-content-subtle">
                {reviewing.profile?.full_name ?? 'Unknown user'} · {formatDate(reviewing.created_at)}
              </p>
            </div>
            <Textarea
              label="Review notes"
              placeholder="Actions taken or findings (visible to administrators only)."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
