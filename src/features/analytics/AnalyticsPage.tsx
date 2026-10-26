import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Star, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState, ChartSkeleton } from '@/components/ui/States'
import { Badge, BOOKING_STATUS_LABELS } from '@/components/ui/Badge'
import { useAsyncData } from '@/hooks/useAsyncData'
import { formatDate, formatDuration, toDateInputValue } from '@/lib/utils'
import type { BookingStatus } from '@/types/models'
import {
  fetchAdminDashboardStats,
  fetchBookingTrends,
  fetchCategoryDistribution,
  fetchDecisionTrends,
  fetchFeedbackSummary,
  fetchResourceUtilization,
  fetchStatusDistribution,
  fetchTopResources,
} from './api'

type Preset = '7d' | '30d' | '90d' | 'custom'

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  completed: '#0ea5e9',
  rejected: '#ef4444',
  cancelled: '#94a3b8',
}

function isoWindow(from: Date, to: Date) {
  return { from: from.toISOString(), to: to.toISOString() }
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState(
    toDateInputValue(new Date(Date.now() - 29 * 86_400_000)),
  )
  const [customTo, setCustomTo] = useState(toDateInputValue(new Date()))

  const range = useMemo(() => {
    if (preset === 'custom') {
      const from = new Date(`${customFrom}T00:00:00`)
      const toStart = new Date(`${customTo}T00:00:00`)
      const to = new Date(toStart.getTime() + 86_400_000)
      return { from, to }
    }
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
    const to = new Date()
    const from = new Date(to.getTime() - (days - 1) * 86_400_000)
    from.setHours(0, 0, 0, 0)
    return { from, to }
  }, [preset, customFrom, customTo])

  const { from, to } = isoWindow(range.from, range.to)

  const { data, loading, error, reload } = useAsyncData(`analytics:${from}|${to}`, async () => {
    const [trends, statuses, categories, top, utilization, decisions, stats, feedback] =
      await Promise.all([
        fetchBookingTrends(from, to),
        fetchStatusDistribution(from, to),
        fetchCategoryDistribution(from, to),
        fetchTopResources(from, to, 8),
        fetchResourceUtilization(from, to),
        fetchDecisionTrends(from, to),
        fetchAdminDashboardStats(),
        fetchFeedbackSummary(),
      ])
    return { trends, statuses, categories, top, utilization, decisions, stats, feedback }
  })

  const totalBookings = (data?.statuses ?? []).reduce((sum, point) => sum + point.total, 0)
  const busiest = (data?.utilization ?? []).slice().sort((a, b) => b.utilization_pct - a.utilization_pct)[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Aggregated booking, utilisation and approval reporting computed directly from the database."
        actions={
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['7d', 'Last 7 days'],
                ['30d', 'Last 30 days'],
                ['90d', 'Last 90 days'],
                ['custom', 'Custom range'],
              ] as Array<[Preset, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={preset === value ? 'primary' : 'outline'}
                onClick={() => setPreset(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex gap-3">
              <Input
                label="From"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(event) => setCustomFrom(event.target.value)}
                containerClassName="w-40"
              />
              <Input
                label="To"
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(event) => setCustomTo(event.target.value)}
                containerClassName="w-40"
              />
            </div>
          )}
        </CardBody>
        <div className="border-t border-line px-5 py-3 text-xs text-content-subtle sm:px-6">
          Showing {formatDate(from)} – {formatDate(to)} · grouped in the institution time zone
        </div>
      </Card>

      {loading ? (
        <ChartSkeleton height={240} />
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Bookings in range"
              value={totalBookings}
              hint={`${data.stats?.bookings_last_7_days ?? 0} in the last 7 days`}
              icon={<BarChart3 aria-hidden className="h-5 w-5" />}
            />
            <StatCard
              label="Pending approvals"
              value={data.stats?.pending_approvals ?? 0}
              icon={<TrendingUp aria-hidden className="h-5 w-5" />}
              tone={(data.stats?.pending_approvals ?? 0) > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="Busiest resource"
              value={busiest ? `${busiest.utilization_pct}%` : '—'}
              hint={busiest ? busiest.resource_name : 'No reservations in this range'}
              tone="info"
            />
            <StatCard
              label="Average rating"
              value={
                data.feedback?.average_rating !== null && data.feedback?.average_rating !== undefined
                  ? `${data.feedback.average_rating} / 5`
                  : 'No ratings'
              }
              hint={`${data.feedback?.total_feedback ?? 0} feedback entries`}
              icon={<Star aria-hidden className="h-5 w-5" />}
              tone="neutral"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bookings over time" description="Created, approved and completed per day" />
              <CardBody>
                {data.trends.length === 0 ? (
                  <EmptyState title="No bookings in this period" description="Try widening the date range." />
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.trends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                        <XAxis dataKey="day" tickFormatter={(value: string) => formatDate(value)} fontSize={12} />
                        <YAxis allowDecimals={false} fontSize={12} />
                        <Tooltip labelFormatter={(value) => formatDate(String(value))} />
                        <Legend />
                        <Bar dataKey="created" name="Created" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="approved" name="Approved" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="completed" name="Completed" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Status distribution" description="Every booking created in the range" />
              <CardBody>
                {data.statuses.length === 0 ? (
                  <EmptyState title="Nothing to chart yet" description="No bookings fall inside this date range." />
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.statuses}
                          dataKey="total"
                          nameKey="status"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {data.statuses.map((point) => (
                            <Cell key={point.status} fill={STATUS_COLORS[point.status] ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, entry) => [
                            value,
                            BOOKING_STATUS_LABELS[entry?.payload?.status as BookingStatus] ?? 'Bookings',
                          ]}
                        />
                        <Legend
                          formatter={(_value, entry) =>
                            BOOKING_STATUS_LABELS[
                              (entry?.payload as { status?: BookingStatus } | undefined)
                                ?.status as BookingStatus
                            ] ?? 'Unknown'
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Bookings by category" description="Which kinds of resource are in demand" />
              <CardBody>
                {data.categories.length === 0 ? (
                  <EmptyState title="No category data" description="Bookings need to exist in the selected range." />
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.categories}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                        <XAxis dataKey="category" fontSize={12} interval={0} angle={-15} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="total" name="Bookings" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Most-booked resources" description="Top resources by reservation count" />
              <CardBody>
                {data.top.length === 0 ? (
                  <EmptyState title="No bookings to rank" description="Reservations in this window will be ranked here." />
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.top} layout="vertical" margin={{ left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                        <XAxis type="number" allowDecimals={false} fontSize={12} />
                        <YAxis type="category" dataKey="resource_name" width={140} fontSize={12} />
                        <Tooltip
                          formatter={(value, name) => [name === 'Bookings' ? value : formatDuration(Number(value)), name]}
                        />
                        <Bar dataKey="booking_count" name="Bookings" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Approval outcomes"
              description="Daily approved vs rejected requests and the running approval rate"
            />
            <CardBody>
              {data.decisions.length === 0 ? (
                <EmptyState title="No decisions recorded" description="Nothing was approved or rejected in this range." />
              ) : (
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.decisions}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="day" tickFormatter={(value: string) => formatDate(value)} fontSize={12} />
                      <YAxis yAxisId="left" allowDecimals={false} fontSize={12} />
                      <YAxis yAxisId="right" orientation="right" unit="%" fontSize={12} />
                      <Tooltip labelFormatter={(value) => formatDate(String(value))} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="approved" name="Approved" stroke="#10b981" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="rejected" name="Rejected" stroke="#ef4444" strokeWidth={2} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="approval_rate"
                        name="Approval rate (%)"
                        stroke="#4f46e5"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Resource utilisation"
              description="Booked minutes against the minutes each resource was open in this range"
            />
            {data.utilization.length === 0 ? (
              <CardBody>
                <EmptyState title="No utilisation data" description="Select a wider range to see utilisation." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {data.utilization.map((row) => (
                  <li key={row.resource_id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-content">{row.resource_name}</p>
                        <p className="mt-0.5 text-xs text-content-subtle">
                          {[row.category, row.building].filter(Boolean).join(' · ') || 'Uncategorised'}
                          {row.capacity !== null ? ` · ${row.capacity} seats` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone="neutral">{row.booking_count} bookings</Badge>
                        <Badge tone="neutral">{formatDuration(row.booked_minutes)} booked</Badge>
                        <span className="w-14 text-right text-sm font-semibold text-content">
                          {row.utilization_pct}%
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${Math.min(100, row.utilization_pct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Feedback overview" />
            <CardBody className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Entries</p>
                <p className="mt-1 text-2xl font-semibold text-content">{data.feedback?.total_feedback ?? 0}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Average</p>
                <p className="mt-1 text-2xl font-semibold text-content">
                  {data.feedback?.average_rating ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Open</p>
                <p className="mt-1 text-2xl font-semibold text-content">{data.feedback?.open_feedback ?? 0}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Low ratings (≤2)</p>
                <p className="mt-1 text-2xl font-semibold text-content">{data.feedback?.low_rating_count ?? 0}</p>
              </div>
            </CardBody>
          </Card>

          <p className="text-xs text-content-subtle">
            All figures are produced by PostgreSQL functions over the same tables the rest of the
            application uses; chart totals therefore match the underlying booking records.
          </p>
        </>
      )}
    </div>
  )
}
