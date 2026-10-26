import type { ReactNode } from 'react'
import { CheckCircle2, Clock, CalendarCheck, XCircle, Ban, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BookingStatus, UserRole } from '@/types/models'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-content-muted border-line',
  brand: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:border-brand-500/30',
  success:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  warning:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  danger:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  icon,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; tone: BadgeTone; icon: ReactNode }
> = {
  pending: { label: 'Pending', tone: 'warning', icon: <Clock aria-hidden className="h-3 w-3" /> },
  approved: { label: 'Approved', tone: 'success', icon: <CalendarCheck aria-hidden className="h-3 w-3" /> },
  rejected: { label: 'Rejected', tone: 'danger', icon: <XCircle aria-hidden className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <Ban aria-hidden className="h-3 w-3" /> },
  completed: { label: 'Completed', tone: 'info', icon: <CheckCircle2 aria-hidden className="h-3 w-3" /> },
}

export const BOOKING_STATUS_LABELS = Object.fromEntries(
  Object.entries(BOOKING_STATUS_META).map(([key, meta]) => [key, meta.label]),
) as Record<BookingStatus, string>

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const meta = BOOKING_STATUS_META[status]
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  )
}

const ROLE_META: Record<UserRole, { label: string; tone: BadgeTone; description: string }> = {
  student: { label: 'Student', tone: 'info', description: 'Browse resources, book and give feedback' },
  faculty: { label: 'Faculty', tone: 'brand', description: 'Book resources and manage own bookings' },
  admin: { label: 'Administrator', tone: 'danger', description: 'Full administrative access' },
}

export const ROLE_LABELS = Object.fromEntries(
  Object.entries(ROLE_META).map(([key, meta]) => [key, meta.label]),
) as Record<UserRole, string>

export const ROLE_DESCRIPTIONS = Object.fromEntries(
  Object.entries(ROLE_META).map(([key, meta]) => [key, meta.description]),
) as Record<UserRole, string>

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  const meta = ROLE_META[role]
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function ApprovalBadge({ required }: { required: boolean }) {
  return required ? (
    <Badge tone="warning" icon={<AlertTriangle aria-hidden className="h-3 w-3" />}>
      Needs approval
    </Badge>
  ) : (
    <Badge tone="success" icon={<CheckCircle2 aria-hidden className="h-3 w-3" />}>
      Instant booking
    </Badge>
  )
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>
  )
}
