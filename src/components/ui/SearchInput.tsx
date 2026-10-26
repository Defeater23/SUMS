import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

/**
 * Text search input with a debounced change callback, used by every list view.
 * The debounce keeps API calls proportional to typing pauses.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  delay = 300,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  delay?: number
  className?: string
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) return undefined
    const timer = window.setTimeout(() => onChange(draft), delay)
    return () => window.clearTimeout(timer)
  }, [draft, value, onChange, delay])

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle"
      />
      <input
        type="search"
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className="input-base pl-9 pr-9"
      />
      {draft && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Clear search"
          onClick={() => {
            setDraft('')
            onChange('')
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 px-2"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
