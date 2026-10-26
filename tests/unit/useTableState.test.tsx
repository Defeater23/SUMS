import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableState } from '@/hooks/useTableState'

interface Row {
  id: number
  name: string
  seats: number
  active: boolean
}

const rows: Row[] = [
  { id: 1, name: 'Alpha Hall', seats: 120, active: true },
  { id: 2, name: 'Beta Lab', seats: 30, active: true },
  { id: 3, name: 'Gamma Room', seats: 12, active: false },
  { id: 4, name: 'Delta Studio', seats: 8, active: true },
]

const options = {
  searchText: (row: Row) => `${row.name}`,
  sorters: {
    name: (row: Row) => row.name,
    seats: (row: Row) => row.seats,
  },
  initialSortKey: 'name',
  initialPageSize: 2,
}

describe('useTableState', () => {
  it('sorts by the initial key and paginates', () => {
    const { result } = renderHook(() => useTableState(rows, options))

    expect(result.current.filteredCount).toBe(4)
    expect(result.current.totalPages).toBe(2)
    expect(result.current.page).toBe(1)
    expect(result.current.pageRows.map((row) => row.name)).toEqual(['Alpha Hall', 'Beta Lab'])
  })

  it('filters with the search box and resets to the first page', () => {
    const { result } = renderHook(() => useTableState(rows, options))

    act(() => result.current.setPage(2))
    expect(result.current.page).toBe(2)

    act(() => result.current.setQuery('lab'))
    expect(result.current.page).toBe(1)
    expect(result.current.pageRows.map((row) => row.name)).toEqual(['Beta Lab'])
  })

  it('toggles the direction when the same column is clicked twice', () => {
    const { result } = renderHook(() => useTableState(rows, options))

    act(() => result.current.toggleSort('seats'))
    expect(result.current.sortKey).toBe('seats')
    expect(result.current.direction).toBe('asc')
    expect(result.current.pageRows.map((row) => row.seats)).toEqual([8, 12])

    act(() => result.current.toggleSort('seats'))
    expect(result.current.direction).toBe('desc')
    expect(result.current.pageRows.map((row) => row.seats)).toEqual([120, 30])
  })

  it('applies an extra predicate before searching', () => {
    const { result } = renderHook(() =>
      useTableState(rows, { ...options, predicate: (row: Row) => row.active }),
    )

    expect(result.current.filteredCount).toBe(3)
    expect(result.current.totalCount).toBe(4)
  })

  it('clamps the page when a filter shrinks the result set', () => {
    const { result } = renderHook(() => useTableState(rows, options))

    act(() => result.current.setPage(2))
    act(() => result.current.setQuery('delta'))

    expect(result.current.page).toBe(1)
    expect(result.current.pageRows).toHaveLength(1)
  })

  it('resets to the first page when the page size changes', () => {
    const { result } = renderHook(() => useTableState(rows, options))

    act(() => result.current.setPage(2))
    act(() => result.current.setPageSize(4))

    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.pageRows).toHaveLength(4)
  })
})
