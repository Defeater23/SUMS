import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <GraduationCap aria-hidden className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-content">SUMS</span>
          <span className="truncate text-xs text-content-subtle">Resource Management</span>
        </span>
      )}
    </span>
  )
}

export function AppLoader({ label = 'Loading SUMS…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-raised">
        <GraduationCap aria-hidden className="h-6 w-6" />
      </span>
      <div className="text-center">
        <p className="text-sm font-semibold text-content">SUMS</p>
        <p className="mt-0.5 text-xs text-content-muted">{label}</p>
      </div>
      <span className="h-1 w-40 overflow-hidden rounded-full bg-line">
        <span className="block h-full w-1/2 animate-pulse rounded-full bg-brand-600" />
      </span>
    </div>
  )
}
