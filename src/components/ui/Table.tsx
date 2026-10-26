import type { HTMLAttributes, ReactNode, ThHTMLAttributes } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TableWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('w-full overflow-x-auto scroll-thin', className)}
      role="region"
      tabIndex={0}
      aria-label="Scrollable table"
      {...props}
    />
  )
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('table-base min-w-full', className)} {...props} />
}

export type SortDirection = 'asc' | 'desc'

export interface SortableHeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string
  activeKey: string | null
  direction: SortDirection
  onSort: (key: string) => void
  children: ReactNode
  align?: 'left' | 'right' | 'center'
}

export function SortableHeader({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
  align = 'left',
  className,
  ...props
}: SortableHeaderProps) {
  const isActive = activeKey === sortKey

  return (
    <th
      scope="col"
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(align === 'right' && 'text-right', align === 'center' && 'text-center', className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-content-subtle transition hover:text-content"
      >
        {children}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp aria-hidden className="h-3 w-3" />
          ) : (
            <ArrowDown aria-hidden className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown aria-hidden className="h-3 w-3 opacity-50" />
        )}
      </button>
    </th>
  )
}

export function EmptyTableRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-content-muted">
        {children}
      </td>
    </tr>
  )
}
