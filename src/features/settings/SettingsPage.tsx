import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Moon, Plus, Save, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Checkbox, Input } from '@/components/ui/Field'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { Badge, RoleBadge, ROLE_LABELS } from '@/components/ui/Badge'
import { EmptyState, InlineError } from '@/components/ui/States'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchResourceCategories } from '@/features/resources/api'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { getErrorMessage } from '@/lib/errors'
import {
  categorySchema,
  profileSchema,
  resetPasswordSchema,
  settingsSchema,
  type CategoryValues,
  type ProfileValues,
  type ResetPasswordValues,
  type SettingsValues,
} from '@/lib/validation'
import { cn } from '@/lib/utils'
import type { ResourceCategory, UserRole } from '@/types/models'
import {
  createCategory,
  deleteCategory,
  fetchAppSettings,
  updateAppSettings,
  updateCategory,
} from './api'

type SettingsTab = 'profile' | 'appearance' | 'security' | 'institution'

export function SettingsPage() {
  const { profile, isAdmin, updateProfile, updatePassword } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [tab, setTab] = useState<SettingsTab>('profile')

  const tabs: TabItem<SettingsTab>[] = [
    { value: 'profile', label: 'Profile' },
    { value: 'appearance', label: 'Appearance' },
    { value: 'security', label: 'Security' },
    ...(isAdmin ? [{ value: 'institution' as SettingsTab, label: 'Institution' }] : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, appearance and — for administrators — institution-wide booking rules."
      />

      <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Settings sections" />

      {tab === 'profile' && (
        <ProfileSection
          defaultValues={{
            full_name: profile?.full_name ?? '',
            department: profile?.department ?? '',
            phone: profile?.phone ?? '',
          }}
          email={profile?.email ?? ''}
          role={profile?.role ?? 'student'}
          onSubmit={async (values) => {
            await updateProfile(values)
            toast.success('Profile updated', 'Your changes have been saved.')
          }}
        />
      )}

      {tab === 'appearance' && (
        <Card>
          <CardHeader title="Appearance" description="Choose how SUMS looks on this device." />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['light', 'Light', Sun],
                  ['dark', 'Dark', Moon],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition',
                    theme === value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-line hover:bg-surface-muted',
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-content">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-content">{label} theme</span>
                    <span className="block text-xs text-content-muted">
                      {theme === value ? 'Currently active' : `Switch to ${label.toLowerCase()}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-content-subtle">
              Your preference is stored on this device. Both themes meet the contrast requirements of
              the design system.
            </p>
          </CardBody>
        </Card>
      )}

      {tab === 'security' && (
        <PasswordSection
          onSubmit={async (values) => {
            await updatePassword(values.password)
            toast.success('Password updated', 'Use your new password the next time you sign in.')
          }}
        />
      )}

      {tab === 'institution' && isAdmin && <InstitutionSection />}
    </div>
  )
}

function ProfileSection({
  defaultValues,
  email,
  role,
  onSubmit,
}: {
  defaultValues: ProfileValues
  email: string
  role: UserRole
  onSubmit: (values: ProfileValues) => Promise<void>
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues })

  useEffect(() => {
    reset(defaultValues)
  }, [reset, defaultValues])

  return (
    <Card>
      <CardHeader
        title="Your profile"
        description="This information appears next to your bookings and feedback."
        action={<RoleBadge role={role} />}
      />
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError(null)
          try {
            await onSubmit(values)
          } catch (error) {
            setFormError(getErrorMessage(error))
          }
        })}
        noValidate
      >
        <CardBody className="space-y-4">
          {formError && <InlineError message={formError} />}
          <Input label="Email address" value={email} readOnly disabled hint="Contact an administrator to change your email address." />
          <Input label="Full name" required error={errors.full_name?.message} {...register('full_name')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Department" placeholder="e.g. Computer Science" error={errors.department?.message} {...register('department')} />
            <Input label="Phone" placeholder="Optional" error={errors.phone?.message} {...register('phone')} />
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={isSubmitting} leadingIcon={<Save aria-hidden className="h-4 w-4" />}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordSection({ onSubmit }: { onSubmit: (values: ResetPasswordValues) => Promise<void> }) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  return (
    <Card>
      <CardHeader
        title="Password"
        description="Passwords are managed by Supabase Auth; they are never stored by the application."
        action={<Badge tone="neutral" icon={<ShieldCheck aria-hidden className="h-3 w-3" />}>Supabase Auth</Badge>}
      />
      <form
        onSubmit={handleSubmit(async (values) => {
          setFormError(null)
          try {
            await onSubmit(values)
            reset({ password: '', confirmPassword: '' })
          } catch (error) {
            setFormError(getErrorMessage(error))
          }
        })}
        noValidate
      >
        <CardBody className="space-y-4">
          {formError && <InlineError message={formError} />}
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.password?.message}
            hint="At least 8 characters."
            {...register('password')}
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={isSubmitting}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function InstitutionSection() {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    data: settings,
    loading,
    error,
    reload,
  } = useAsyncData('settings:app', fetchAppSettings)
  const {
    data: categories,
    loading: loadingCategories,
    reload: reloadCategories,
  } = useAsyncData('settings:categories', fetchResourceCategories)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema) })

  useEffect(() => {
    if (!settings) return
    reset({
      institution_name: settings.institution_name,
      timezone: settings.timezone,
      booking_open_hour: settings.booking_open_hour,
      booking_close_hour: settings.booking_close_hour,
      allow_weekends: settings.allow_weekends,
      min_lead_time_minutes: settings.min_lead_time_minutes,
      cancellation_cutoff_mins: settings.cancellation_cutoff_mins,
      slot_granularity_mins: settings.slot_granularity_mins,
      auto_approve_roles: settings.auto_approve_roles,
    })
  }, [settings, reset])

  const [newCategory, setNewCategory] = useState<CategoryValues>({ name: '', description: '' })
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ResourceCategory | null>(null)
  const [renaming, setRenaming] = useState<ResourceCategory | null>(null)

  if (loading) {
    return (
      <Card>
        <CardBody>Loading institution settings…</CardBody>
      </Card>
    )
  }

  if (error || !settings) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <InlineError message={error ?? 'Institution settings are unavailable.'} />
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Booking rules"
          description="These rules are enforced by the database for every booking request."
        />
        <form
          onSubmit={handleSubmit(async (values) => {
            setFormError(null)
            try {
              await updateAppSettings(values)
              toast.success('Settings saved', 'Booking rules have been updated.')
              reload()
            } catch (err) {
              setFormError(getErrorMessage(err))
            }
          })}
          noValidate
        >
          <CardBody className="space-y-5">
            {formError && <InlineError message={formError} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Institution name" required error={errors.institution_name?.message} {...register('institution_name')} />
              <Input
                label="Time zone"
                required
                hint="IANA name, e.g. Asia/Kolkata"
                error={errors.timezone?.message}
                {...register('timezone')}
              />
            </div>

            <fieldset className="rounded-xl border border-line px-4 py-4">
              <legend className="px-1 text-sm font-semibold text-content">Opening hours</legend>
              <div className="mt-2 grid gap-4 sm:grid-cols-3">
                <Input label="Earliest hour" type="number" min={0} max={23} required error={errors.booking_open_hour?.message} {...register('booking_open_hour')} />
                <Input label="Latest hour" type="number" min={1} max={24} required error={errors.booking_close_hour?.message} {...register('booking_close_hour')} />
                <Input
                  label="Slot size (minutes)"
                  type="number"
                  min={5}
                  max={240}
                  required
                  error={errors.slot_granularity_mins?.message}
                  {...register('slot_granularity_mins')}
                />
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Minimum lead time (minutes)"
                type="number"
                min={0}
                required
                error={errors.min_lead_time_minutes?.message}
                {...register('min_lead_time_minutes')}
              />
              <Input
                label="Cancellation cut-off (minutes)"
                type="number"
                min={0}
                required
                error={errors.cancellation_cutoff_mins?.message}
                {...register('cancellation_cutoff_mins')}
              />
            </div>

            <Controller
              control={control}
              name="allow_weekends"
              render={({ field }) => (
                <Checkbox
                  label="Allow weekend bookings"
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                  ref={field.ref}
                />
              )}
            />

            <Controller
              control={control}
              name="auto_approve_roles"
              render={({ field }) => (
                <div className="rounded-xl border border-line px-4 py-4">
                  <p className="text-sm font-medium text-content">
                    Roles that skip approval
                  </p>
                  <p className="field-hint">
                    Resources marked “needs approval” still create a pending request unless the
                    requester’s role is listed here. Leave empty to review every request.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4">
                    {(['student', 'faculty', 'admin'] as UserRole[]).map((role) => (
                      <label key={role} className="flex items-center gap-2 text-sm text-content">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500/40"
                          checked={field.value.includes(role)}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...field.value, role]
                              : field.value.filter((item) => item !== role)
                            field.onChange(next)
                          }}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            />
          </CardBody>
          <CardFooter>
            <Button type="submit" loading={isSubmitting} leadingIcon={<Save aria-hidden className="h-4 w-4" />}>
              Save settings
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Resource categories"
          description="Categories group the catalogue and power the analytics breakdown."
          action={<Badge tone="neutral" icon={<Building2 aria-hidden className="h-3 w-3" />}>{categories?.length ?? 0} categories</Badge>}
        />

        <CardBody className="space-y-4">
          {categoryError && <InlineError message={categoryError} />}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              label="New category"
              placeholder="e.g. Auditorium"
              value={newCategory.name}
              onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))}
              containerClassName="sm:max-w-xs"
            />
            <Input
              label="Description"
              placeholder="Optional"
              value={newCategory.description ?? ''}
              onChange={(event) => setNewCategory((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="flex items-end">
              <Button
                loading={savingCategory}
                leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
                onClick={async () => {
                  setCategoryError(null)
                  const parsed = categorySchema.safeParse(newCategory)
                  if (!parsed.success) {
                    setCategoryError(parsed.error.issues[0]?.message ?? 'Enter a category name.')
                    return
                  }
                  setSavingCategory(true)
                  try {
                    await createCategory(parsed.data)
                    toast.success('Category added', parsed.data.name)
                    setNewCategory({ name: '', description: '' })
                    reloadCategories()
                  } catch (err) {
                    setCategoryError(getErrorMessage(err))
                  } finally {
                    setSavingCategory(false)
                  }
                }}
              >
                Add
              </Button>
            </div>
          </div>

          {loadingCategories ? (
            <p className="text-sm text-content-muted">Loading categories…</p>
          ) : (categories ?? []).length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden className="h-5 w-5" />}
              title="No categories yet"
              description="Add categories such as Classroom, Laboratory or Equipment."
            />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {(categories ?? []).map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content">{category.name}</p>
                    {category.description && (
                      <p className="mt-0.5 text-xs text-content-muted">{category.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(category)}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => setPendingDelete(category)}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name ?? 'category'}?`}
        description="Resources in this category are kept; they simply become uncategorised."
        confirmLabel="Delete category"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await deleteCategory(pendingDelete.id)
            toast.success('Category deleted', pendingDelete.name)
            setPendingDelete(null)
            reloadCategories()
          } catch (err) {
            toast.error('Could not delete the category', getErrorMessage(err))
          }
        }}
      />

      {renaming && (
        <RenameCategoryModal
          category={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null)
            reloadCategories()
          }}
        />
      )}
    </div>
  )
}

function RenameCategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: ResourceCategory
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <ConfirmDialog
      open
      title="Rename category"
      confirmLabel="Save changes"
      loading={saving}
      onCancel={onClose}
      onConfirm={async () => {
        setError(null)
        const parsed = categorySchema.safeParse({ name, description })
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Enter a category name.')
          return
        }
        setSaving(true)
        try {
          await updateCategory(category.id, parsed.data)
          toast.success('Category updated', parsed.data.name)
          onSaved()
        } catch (err) {
          setError(getErrorMessage(err))
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="space-y-4">
        {error && <InlineError message={error} />}
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  )
}
