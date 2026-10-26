import { useCallback, useMemo, useState } from 'react'
import type { SortDirection } from '@/components/ui/Table'

export type SortValue = string | number | Date | null | undefined

export interface UseTableStateOptions<T> {
  /** Text used by the free-text search box. */
  searchText?: (row: T) => string
  /** Sort accessors keyed by column id. */
  sorters: Record<string, (row: T) => SortValue>
  /** Extra predicate applied before search (filters, tabs…). */
  predicate?: (row: T) => boolean
  initialSortKey?: string
  initialDirection?: SortDirection
  initialPageSize?: number
}

/**
 * Shared list behaviour: search, sorting and pagination.
 * Keeps every table screen consistent without duplicating logic.
 */
export function useTableState<T>(rows: T[], options: UseTableStateOptions<T>) {
  const {
    searchText,
    sorters,
    predicate,
    initialSortKey = null,
    initialDirection = 'asc',
    initialPageSize = 10,
  } = options

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey)
  const [direction, setDirection] = useState<SortDirection>(initialDirection)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const toggleSort = useCallback(
    (key: string) => {
      setPage(1)
      if (sortKey === key) {
        setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
        return
      }
      setSortKey(key)
      setDirection('asc')
    },
    [sortKey],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let result = rows

    if (predicate) result = result.filter(predicate)
    if (needle && searchText) {
      result = result.filter((row) => searchText(row).toLowerCase().includes(needle))
    }
    return result
  }, [rows, query, predicate, searchText])

  const sorted = useMemo(() => {
    if (!sortKey || !sorters[sortKey]) return filtered
    const accessor = sorters[sortKey]
    const factor = direction === 'asc' ? 1 : -1

    return [...filtered].sort((left, right) => {
      const a = accessor(left)
      const b = accessor(right)

      if (a === b) return 0
      if (a === null || a === undefined) return 1
      if (b === null || b === undefined) return -1

      if (a instanceof Date && b instanceof Date) {
        return (a.getTime() - b.getTime()) * factor
      }
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor
    })
  }, [filtered, sortKey, sorters, direction])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setPage(1)
  }, [])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  return {
    query,
    setQuery: handleQueryChange,
    sortKey,
    direction,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    pageRows,
    filteredCount: total,
    totalCount: rows.length,
    totalPages,
  }
}
