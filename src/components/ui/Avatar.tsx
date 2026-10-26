import { Star } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

export function Avatar({
  name,
  email,
  className,
}: {
  name?: string | null
  email?: string | null
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200',
        className,
      )}
    >
      {initials(name, email)}
    </span>
  )
}

export function Rating({
  value,
  max = 5,
  size = 'md',
  className,
}: {
  value: number
  max?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const dimension = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${value} out of ${max} stars`}
    >
      {Array.from({ length: max }).map((_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn(
            dimension,
            index < Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'text-line',
          )}
        />
      ))}
    </span>
  )
}

export interface RatingInputProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export function RatingInput({ value, onChange, disabled }: RatingInputProps) {
  return (
    <div role="radiogroup" aria-label="Rating" className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            'rounded p-1 transition hover:bg-surface-muted disabled:cursor-not-allowed',
            value >= star ? 'text-amber-400' : 'text-line',
          )}
        >
          <Star aria-hidden className={cn('h-5 w-5', value >= star && 'fill-amber-400')} />
        </button>
      ))}
    </div>
  )
}
