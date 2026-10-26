import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/errors'
import { resourceSchema, type ResourceValues } from '@/lib/validation'
import { shortTime } from '@/lib/utils'
import type { Resource, ResourceCategory } from '@/types/models'
import { createResource, updateResource } from './api'

const DEFAULTS: ResourceValues = {
  name: '',
  description: '',
  category_id: '',
  building: '',
  location: '',
  capacity: '',
  equipment: '',
  image_url: '',
  requires_approval: false,
  is_active: true,
  opens_at: '08:00',
  closes_at: '20:00',
  min_booking_minutes: 30,
  max_booking_minutes: 240,
  advance_days: 30,
}

function toFormValues(resource: Resource): ResourceValues {
  return {
    name: resource.name,
    description: resource.description ?? '',
    category_id: resource.category_id ?? '',
    building: resource.building ?? '',
    location: resource.location ?? '',
    capacity: resource.capacity ?? '',
    equipment: resource.equipment.join(', '),
    image_url: resource.image_url ?? '',
    requires_approval: resource.requires_approval,
    is_active: resource.is_active,
    opens_at: shortTime(resource.opens_at),
    closes_at: shortTime(resource.closes_at),
    min_booking_minutes: resource.min_booking_minutes,
    max_booking_minutes: resource.max_booking_minutes,
    advance_days: resource.advance_days,
  }
}

export function ResourceFormModal({
  open,
  onClose,
  onSaved,
  resource,
  categories,
  userId,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** `null` creates a new resource. */
  resource: Resource | null
  categories: ResourceCategory[]
  userId: string | null
}) {
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResourceValues>({
    resolver: zodResolver(resourceSchema),
    defaultValues: DEFAULTS,
  })

  useEffect(() => {
    if (!open) return
    reset(resource ? toFormValues(resource) : DEFAULTS)
  }, [open, resource, reset])

  const onSubmit = async (values: ResourceValues) => {
    try {
      if (resource) {
        await updateResource(resource.id, values)
        toast.success('Resource updated', `${values.name} has been saved.`)
      } else {
        await createResource(values, userId)
        toast.success('Resource created', `${values.name} is now in the catalogue.`)
      }
      onSaved()
      onClose()
    } catch (error) {
      toast.error('Could not save the resource', getErrorMessage(error))
    }
  }

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resource ? 'Edit resource' : 'New resource'}
      description="Resources are shown to every signed-in user. Deactivate instead of deleting to keep booking history intact."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="resource-form" loading={isSubmitting}>
            {resource ? 'Save changes' : 'Create resource'}
          </Button>
        </>
      }
    >
      <form id="resource-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" required error={errors.name?.message} {...register('name')} />
          <Select
            label="Category"
            placeholder="No category"
            options={categoryOptions}
            error={errors.category_id?.message}
            {...register('category_id')}
          />
        </div>

        <Textarea
          label="Description"
          placeholder="What is this space or equipment suitable for?"
          error={errors.description?.message}
          {...register('description')}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Building" placeholder="e.g. Science Block" error={errors.building?.message} {...register('building')} />
          <Input label="Location" placeholder="e.g. Room 204" error={errors.location?.message} {...register('location')} />
          <Input
            label="Capacity"
            type="number"
            min={1}
            placeholder="Optional"
            error={errors.capacity?.message}
            {...register('capacity')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Equipment"
            placeholder="Projector, Whiteboard, HDMI"
            hint="Separate items with commas."
            error={errors.equipment?.message}
            {...register('equipment')}
          />
          <Input
            label="Image URL"
            placeholder="Optional"
            error={errors.image_url?.message}
            {...register('image_url')}
          />
        </div>

        <fieldset className="rounded-xl border border-line px-4 py-4">
          <legend className="px-1 text-sm font-semibold text-content">Availability rules</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-3">
            <Input label="Opens at" type="time" required error={errors.opens_at?.message} {...register('opens_at')} />
            <Input label="Closes at" type="time" required error={errors.closes_at?.message} {...register('closes_at')} />
            <Input
              label="Book up to (days)"
              type="number"
              min={1}
              max={365}
              required
              error={errors.advance_days?.message}
              {...register('advance_days')}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Minimum booking (minutes)"
              type="number"
              min={5}
              max={1440}
              required
              error={errors.min_booking_minutes?.message}
              {...register('min_booking_minutes')}
            />
            <Input
              label="Maximum booking (minutes)"
              type="number"
              min={5}
              max={1440}
              required
              error={errors.max_booking_minutes?.message}
              {...register('max_booking_minutes')}
            />
          </div>
        </fieldset>

        <div className="space-y-4 rounded-xl border border-line px-4 py-4">
          <Controller
            control={control}
            name="requires_approval"
            render={({ field }) => (
              <Checkbox
                label="Require administrator approval"
                hint="Requests are created as pending and must be approved before the slot is reserved."
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
                ref={field.ref}
              />
            )}
          />
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <Checkbox
                label="Active and bookable"
                hint="Inactive resources stay in the catalogue for reporting but cannot be booked."
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
                ref={field.ref}
              />
            )}
          />
        </div>
      </form>
    </Modal>
  )
}
