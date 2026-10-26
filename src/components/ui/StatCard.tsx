import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  className?: string
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    danger: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
    info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    neutral: 'bg-surface-muted text-content-muted',
  }

  return (
    <div className={cn('card card-pad', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">{label}</p>
          <p className="mt-2 text-2xl font-semibold leading-tight text-content">{value}</p>
          {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
        </div>
        {icon && (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
            {icon}
          </span>
        )}
      </div>
    </div>
  )
}
