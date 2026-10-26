import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select, Input } from '@/components/ui/Field'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { ActiveBadge, ApprovalBadge, Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useTableState } from '@/hooks/useTableState'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { pluralise, shortTime } from '@/lib/utils'
import type { ResourceWithCategory } from '@/types/models'
import {
  deleteResource,
  fetchResourceCategories,
  fetchResources,
  setResourceActive,
} from './api'
import { ResourceFormModal } from './ResourceFormModal'

export function ResourcesPage() {
  const { isAdmin, session } = useAuth()
  const toast = useToast()

  const {
    data: resources,
    loading,
    error,
    reload,
  } = useAsyncData('resources:all', () => fetchResources())
  const { data: categories } = useAsyncData('resource-categories', fetchResourceCategories)

  const [categoryId, setCategoryId] = useState('')
  const [building, setBuilding] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [bookableOnly, setBookableOnly] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceWithCategory | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ResourceWithCategory | null>(null)
  const [working, setWorking] = useState(false)

  const rows = resources ?? []

  const buildings = useMemo(() => {
    const unique = new Set<string>()
    for (const row of rows) {
      const value = row.building?.trim()
      if (value) unique.add(value)
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))
  }, [rows])

  const predicate = useCallback(
    (resource: ResourceWithCategory) => {
      if (categoryId && resource.category_id !== categoryId) return false
      if (building && resource.building !== building) return false
      if (minCapacity && (resource.capacity ?? 0) < Number(minCapacity)) return false
      if (bookableOnly && !resource.is_active) return false
      return true
    },
    [categoryId, building, minCapacity, bookableOnly],
  )

  const table = useTableState<ResourceWithCategory>(rows, {
    searchText: (resource) =>
      [resource.name, resource.building, resource.location, resource.equipment.join(' ')]
        .filter(Boolean)
        .join(' '),
    sorters: {
      name: (resource) => resource.name,
      building: (resource) => resource.building,
      capacity: (resource) => resource.capacity,
      category: (resource) => resource.category?.name ?? null,
    },
    predicate,
    initialSortKey: 'name',
    initialPageSize: 12,
  })

  const handleToggleActive = async (resource: ResourceWithCategory) => {
    setWorking(true)
    try {
      await setResourceActive(resource.id, !resource.is_active)
      toast.success(
        resource.is_active ? 'Resource deactivated' : 'Resource activated',
        `${resource.name} is now ${resource.is_active ? 'unavailable for booking' : 'bookable again'}.`,
      )
      reload()
    } catch (err) {
      toast.error('Could not update the resource', getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setWorking(true)
    try {
      await deleteResource(pendingDelete.id)
      toast.success('Resource deleted', `${pendingDelete.name} has been removed.`)
      setPendingDelete(null)
      reload()
    } catch (err) {
      toast.error('Could not delete the resource', getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const filtersActive = Boolean(categoryId || building || minCapacity || bookableOnly)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resources"
        description="Browse classrooms, laboratories, seminar rooms, meeting rooms and bookable equipment."
        actions={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
              leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
            >
              New resource
            </Button>
          ) : null
        }
      />

      <div className="card p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[2fr_repeat(3,minmax(0,1fr))]">
          <SearchInput
            value={table.query}
            onChange={table.setQuery}
            placeholder="Search by name, building or equipment"
            label="Search resources"
          />
          <Select
            aria-label="Filter by category"
            placeholder="All categories"
            options={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          />
          <Select
            aria-label="Filter by building"
            placeholder="All buildings"
            options={buildings}
            value={building}
            onChange={(event) => setBuilding(event.target.value)}
          />
          <Input
            type="number"
            min={1}
            placeholder="Min capacity"
            aria-label="Minimum capacity"
            value={minCapacity}
            onChange={(event) => setMinCapacity(event.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-content-muted">
            <input
              type="checkbox"
              checked={bookableOnly}
              onChange={(event) => setBookableOnly(event.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500/40"
            />
            Only show resources available for booking
          </label>

          <div className="flex items-center gap-3">
            <p className="text-sm text-content-muted" aria-live="polite">
              {table.filteredCount} {pluralise(table.filteredCount, 'resource')}
            </p>
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCategoryId('')
                  setBuilding('')
                  setMinCapacity('')
                  setBookableOnly(false)
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <CardSkeleton count={6} />
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden className="h-5 w-5" />}
          title="No resources yet"
          description={
            isAdmin
              ? 'Add the first classroom, laboratory or piece of equipment to the catalogue.'
              : 'An administrator has not added any resources yet.'
          }
          action={
            isAdmin ? (
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
                leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
              >
                New resource
              </Button>
            ) : undefined
          }
        />
      ) : table.filteredCount === 0 ? (
        <EmptyState
          icon={<LayoutGrid aria-hidden className="h-5 w-5" />}
          title="No matching resources"
          description="Try a different search term or clear the filters."
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {table.pageRows.map((resource) => (
              <li key={resource.id}>
                <article className="card flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-content">
                        <Link className="link" to={`/resources/${resource.id}`}>
                          {resource.name}
                        </Link>
                      </h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                        {resource.building && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin aria-hidden className="h-3 w-3" />
                            {[resource.building, resource.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {resource.capacity !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Users aria-hidden className="h-3 w-3" />
                            {resource.capacity}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <Building2 aria-hidden className="h-5 w-5" />
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col px-5 py-4">
                    <p className="line-clamp-3 text-sm text-content-muted">
                      {resource.description || 'No description provided.'}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {resource.category && <Badge tone="brand">{resource.category.name}</Badge>}
                      <Badge tone="neutral">
                        {shortTime(resource.opens_at)}–{shortTime(resource.closes_at)}
                      </Badge>
                      <ApprovalBadge required={resource.requires_approval} />
                      {!resource.is_active && <ActiveBadge active={false} />}
                    </div>

                    {resource.equipment.length > 0 && (
                      <p className="mt-3 text-xs text-content-subtle">
                        {resource.equipment.slice(0, 4).join(' · ')}
                        {resource.equipment.length > 4 ? ` +${resource.equipment.length - 4}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                    <Link to={`/resources/${resource.id}`}>
                      <Button variant="outline" size="sm">
                        View details
                      </Button>
                    </Link>

                    {isAdmin && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${resource.name}`}
                          onClick={() => {
                            setEditing(resource)
                            setFormOpen(true)
                          }}
                        >
                          <Pencil aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={working}
                          aria-label={`${resource.is_active ? 'Deactivate' : 'Activate'} ${resource.name}`}
                          onClick={() => handleToggleActive(resource)}
                        >
                          <Power aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${resource.name}`}
                          onClick={() => setPendingDelete(resource)}
                        >
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>

          <div className="card overflow-hidden">
            <Pagination
              page={table.page}
              pageSize={table.pageSize}
              total={table.filteredCount}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
              pageSizeOptions={[12, 24, 48]}
            />
          </div>
        </>
      )}

      <ResourceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        resource={editing}
        categories={categories ?? []}
        userId={session?.user?.id ?? null}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? 'resource'}?`}
        description="Resources with existing bookings cannot be deleted — deactivate them instead so historical records stay intact."
        confirmLabel="Delete resource"
        destructive
        loading={working}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      >
        <p className="text-sm text-content-muted">
          This permanently removes the resource from the catalogue. Existing bookings may block the
          deletion and will be reported by the database.
        </p>
      </ConfirmDialog>
    </div>
  )
}
