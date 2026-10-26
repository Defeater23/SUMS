import { useMemo, useState } from 'react'
import { ShieldCheck, UserCog, UserX, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Field'
import { Table, TableWrapper } from '@/components/ui/Table'
import { TableSkeleton, EmptyState, ErrorState } from '@/components/ui/States'
import { ActiveBadge, RoleBadge, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { StatCard } from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useTableState } from '@/hooks/useTableState'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import type { Profile, UserRole } from '@/types/models'
import { fetchProfiles, setUserActive, setUserRole } from './api'

const ROLE_OPTIONS = (['student', 'faculty', 'admin'] as UserRole[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}))

export function UsersPage() {
  const { session } = useAuth()
  const toast = useToast()

  const { data: profiles, loading, error, reload } = useAsyncData('users:profiles', () =>
    fetchProfiles(),
  )

  const [pendingRole, setPendingRole] = useState<{ profile: Profile; role: UserRole } | null>(null)
  const [pendingActive, setPendingActive] = useState<Profile | null>(null)
  const [working, setWorking] = useState(false)

  const rows = profiles ?? []

  const counts = useMemo(
    () => ({
      total: rows.length,
      admins: rows.filter((row) => row.role === 'admin').length,
      faculty: rows.filter((row) => row.role === 'faculty').length,
      students: rows.filter((row) => row.role === 'student').length,
    }),
    [rows],
  )

  const table = useTableState<Profile>(rows, {
    searchText: (profile) => [profile.full_name, profile.email, profile.department].filter(Boolean).join(' '),
    sorters: {
      full_name: (profile) => profile.full_name,
      role: (profile) => profile.role,
      created_at: (profile) => new Date(profile.created_at),
    },
    initialSortKey: 'created_at',
    initialDirection: 'desc',
  })

  const applyRole = async (profile: Profile, role: UserRole) => {
    setWorking(true)
    try {
      await setUserRole(profile.id, role)
      toast.success('Role updated', `${profile.full_name || profile.email} is now ${ROLE_LABELS[role]}.`)
      setPendingRole(null)
      reload()
    } catch (err) {
      toast.error('Could not change the role', getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const applyActive = async () => {
    if (!pendingActive) return
    setWorking(true)
    try {
      await setUserActive(pendingActive.id, !pendingActive.is_active)
      toast.success(
        pendingActive.is_active ? 'Account deactivated' : 'Account reactivated',
        `${pendingActive.full_name || pendingActive.email} ${pendingActive.is_active ? 'can no longer sign in.' : 'can sign in again.'}`,
      )
      setPendingActive(null)
      reload()
    } catch (err) {
      toast.error('Could not update the account', getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const handleRoleChange = (profile: Profile, role: UserRole) => {
    if (role === profile.role) return
    // Elevating to administrator is confirmed explicitly.
    if (role === 'admin') {
      setPendingRole({ profile, role })
      return
    }
    void applyRole(profile, role)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Review accounts, adjust role assignments and suspend access. The database refuses to remove the last active administrator."
        actions={
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total accounts" value={counts.total} icon={<UsersIcon aria-hidden className="h-5 w-5" />} />
        <StatCard label="Administrators" value={counts.admins} icon={<ShieldCheck aria-hidden className="h-5 w-5" />} tone="danger" />
        <StatCard label="Faculty" value={counts.faculty} icon={<UserCog aria-hidden className="h-5 w-5" />} tone="info" />
        <StatCard label="Students" value={counts.students} tone="neutral" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <SearchInput
            value={table.query}
            onChange={table.setQuery}
            placeholder="Search by name, email or department"
            label="Search users"
            className="max-w-md"
          />
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : error ? (
          <div className="p-5">
            <ErrorState description={error} onRetry={reload} />
          </div>
        ) : table.filteredCount === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<UsersIcon aria-hidden className="h-5 w-5" />}
              title={rows.length === 0 ? 'No accounts yet' : 'No accounts match your search'}
              description={
                rows.length === 0
                  ? 'Accounts appear here once people register for SUMS.'
                  : 'Try a different name or email address.'
              }
            />
          </div>
        ) : (
          <>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Department</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Joined</th>
                    <th scope="col" className="text-right">
                      Access
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.pageRows.map((profile) => {
                    const isSelf = profile.id === session?.user?.id
                    return (
                      <tr key={profile.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={profile.full_name} email={profile.email} />
                            <div className="min-w-0">
                              <span className="block font-medium text-content">
                                {profile.full_name || 'Unnamed user'}
                                {isSelf && <span className="ml-1.5 text-xs text-content-subtle">(you)</span>}
                              </span>
                              <span className="mt-0.5 block text-xs text-content-subtle">
                                {profile.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="text-content-muted">{profile.department || '—'}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <RoleBadge role={profile.role} />
                            <Select
                              aria-label={`Change role for ${profile.full_name || profile.email}`}
                              value={profile.role}
                              options={ROLE_OPTIONS}
                              disabled={working}
                              onChange={(event) => handleRoleChange(profile, event.target.value as UserRole)}
                              containerClassName="w-32"
                              className="h-8 py-0 text-xs"
                            />
                          </div>
                          <p className="mt-1 text-xs text-content-subtle">{ROLE_DESCRIPTIONS[profile.role]}</p>
                        </td>
                        <td>
                          <ActiveBadge active={profile.is_active} />
                        </td>
                        <td className="text-content-muted">{formatDate(profile.created_at)}</td>
                        <td>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant={profile.is_active ? 'outline' : 'primary'}
                              disabled={working}
                              onClick={() => setPendingActive(profile)}
                              leadingIcon={<UserX aria-hidden className="h-3.5 w-3.5" />}
                            >
                              {profile.is_active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrapper>
            <Pagination
              page={table.page}
              pageSize={table.pageSize}
              total={table.filteredCount}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingRole)}
        title="Grant administrator access?"
        description={
          pendingRole
            ? `${pendingRole.profile.full_name || pendingRole.profile.email} will be able to manage resources, users and approvals.`
            : undefined
        }
        confirmLabel="Grant administrator"
        destructive
        loading={working}
        onCancel={() => setPendingRole(null)}
        onConfirm={() => pendingRole && applyRole(pendingRole.profile, pendingRole.role)}
      >
        <p className="text-sm text-content-muted">
          Administrators can see every booking, change roles and manage the catalogue. Only continue if
          this person requires full access.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(pendingActive)}
        title={pendingActive?.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        description={pendingActive ? pendingActive.email : undefined}
        confirmLabel={pendingActive?.is_active ? 'Deactivate account' : 'Reactivate account'}
        destructive={Boolean(pendingActive?.is_active)}
        loading={working}
        onCancel={() => setPendingActive(null)}
        onConfirm={applyActive}
      >
        <p className="text-sm text-content-muted">
          {pendingActive?.is_active
            ? 'The account is signed out immediately and cannot sign in again until it is reactivated. Existing bookings are preserved.'
            : 'The account will be able to sign in again with its existing bookings and permissions.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}
