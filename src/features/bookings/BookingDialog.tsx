import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarPlus, Clock, Info, Users } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { InlineError, Spinner } from '@/components/ui/States'
import { ApprovalBadge, Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getErrorMessage, isUnavailableError } from '@/lib/errors'
import { combineDateAndTime, bookingSchema, type BookingFormValues } from '@/lib/validation'
import { formatDuration, formatTime, shortTime, toDateInputValue } from '@/lib/utils'
import type { AppSettings, Booking, ResourceWithCategory } from '@/types/models'
import { createBooking, fetchResourceAvailability } from './api'

export interface BookingDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (booking: Booking) => void
  /** Bookable resources offered in the picker. */
  resources: ResourceWithCategory[]
  settings: AppSettings | null
  /** When set, the resource is fixed and the picker is hidden. */
  fixedResourceId?: string | null
  initialDate?: string
}

function defaultValues(resourceId: string, date: string): BookingFormValues {
  return {
    resource_id: resourceId,
    date,
    start_time: '09:00',
    end_time: '10:00',
    purpose: '',
    attendees: '',
  }
}

/**
 * Create-booking dialog.
 *
 * The client-side rules mirror `public.validate_booking`, but the database is
 * the authority: overlapping reservations are rejected by the GiST exclusion
 * constraint even if two people submit the same slot at the same instant.
 */
export function BookingDialog({
  open,
  onClose,
  onCreated,
  resources,
  settings,
  fixedResourceId = null,
  initialDate,
}: BookingDialogProps) {
  const toast = useToast()
  const today = initialDate ?? toDateInputValue(new Date())

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: defaultValues(fixedResourceId ?? '', today),
  })

  useEffect(() => {
    if (open) reset(defaultValues(fixedResourceId ?? '', today))
  }, [open, fixedResourceId, today, reset])

  const resourceId = watch('resource_id')
  const date = watch('date')
  const startTime = watch('start_time')
  const endTime = watch('end_time')
  const attendees = watch('attendees')

  const selected = useMemo(
    () => resources.find((resource) => resource.id === resourceId) ?? null,
    [resources, resourceId],
  )

  const {
    data: reservations,
    loading: loadingReservations,
    error: reservationError,
    reload: reloadReservations,
  } = useAsyncData(
    `availability:${resourceId}|${date}`,
    async () => {
      if (!resourceId || !date) return []
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      return fetchResourceAvailability(resourceId, dayStart.toISOString(), dayEnd.toISOString())
    },
  )

  const durationMinutes = useMemo(() => {
    if (!date || !startTime || !endTime) return null
    const start = new Date(`${date}T${startTime.length === 5 ? `${startTime}:00` : startTime}`)
    const end = new Date(`${date}T${endTime.length === 5 ? `${endTime}:00` : endTime}`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    return Math.round((end.getTime() - start.getTime()) / 60_000)
  }, [date, startTime, endTime])

  const capacityWarning =
    selected?.capacity && attendees !== '' && attendees !== undefined && Number(attendees) > selected.capacity
      ? `This resource seats ${selected.capacity} people.`
      : null

  const onSubmit = async (values: BookingFormValues) => {
    try {
      const booking = await createBooking({
        resourceId: values.resource_id,
        startsAt: combineDateAndTime(values.date, values.start_time),
        endsAt: combineDateAndTime(values.date, values.end_time),
        purpose: values.purpose,
        attendees: values.attendees === '' || values.attendees === undefined ? null : Number(values.attendees),
      })

      toast.success(
        booking.status === 'approved' ? 'Booking confirmed' : 'Request submitted',
        booking.status === 'approved'
          ? 'Your booking is confirmed and the slot is now reserved.'
          : 'An administrator will review your request shortly.',
      )
      onCreated(booking)
      onClose()
    } catch (error) {
      if (isUnavailableError(error)) {
        reloadReservations()
        toast.error('Slot unavailable', getErrorMessage(error))
        return
      }
      toast.error('Booking not created', getErrorMessage(error))
    }
  }

  const slotStep = (settings?.slot_granularity_mins ?? 30) * 60
  const resourceOptions = resources.map((resource) => ({
    value: resource.id,
    label: resource.building ? `${resource.name} — ${resource.building}` : resource.name,
  }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book a resource"
      description="Choose a resource, date and time. Availability is checked against live reservations."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="booking-form" loading={isSubmitting} leadingIcon={<CalendarPlus aria-hidden className="h-4 w-4" />}>
            Create booking
          </Button>
        </>
      }
    >
      <form id="booking-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {fixedResourceId && selected ? (
          <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">
            <p className="text-sm font-semibold text-content">{selected.name}</p>
            <p className="mt-0.5 text-xs text-content-muted">
              {[selected.building, selected.location].filter(Boolean).join(' · ') || 'Location not specified'}
            </p>
          </div>
        ) : (
          <Select
            label="Resource"
            required
            placeholder="Select a resource"
            options={resourceOptions}
            error={errors.resource_id?.message}
            {...register('resource_id')}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            min={today}
            required
            error={errors.date?.message}
            {...register('date')}
          />
          <Input
            label="Start time"
            type="time"
            step={slotStep}
            required
            error={errors.start_time?.message}
            {...register('start_time')}
          />
          <Input
            label="End time"
            type="time"
            step={slotStep}
            required
            error={errors.end_time?.message}
            {...register('end_time')}
          />
        </div>

        {durationMinutes !== null && (
          <p className="flex items-center gap-2 text-sm text-content-muted">
            <Clock aria-hidden className="h-4 w-4" />
            {durationMinutes > 0 ? (
              <>
                Duration: <strong className="font-medium text-content">{formatDuration(durationMinutes)}</strong>
              </>
            ) : (
              'The end time must be after the start time.'
            )}
          </p>
        )}

        {selected && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              Open {shortTime(selected.opens_at)}–{shortTime(selected.closes_at)}
            </Badge>
            <Badge tone="neutral">
              {selected.min_booking_minutes}–{selected.max_booking_minutes} min
            </Badge>
            {selected.capacity !== null && (
              <Badge tone="neutral" icon={<Users aria-hidden className="h-3 w-3" />}>
                {selected.capacity} seats
              </Badge>
            )}
            <ApprovalBadge required={selected.requires_approval} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Textarea
            label="Purpose"
            placeholder="What will this booking be used for?"
            error={errors.purpose?.message}
            {...register('purpose')}
          />
          <Input
            label="Attendees"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Optional"
            hint={capacityWarning ?? undefined}
            error={errors.attendees?.message}
            {...register('attendees')}
          />
        </div>

        <div className="rounded-xl border border-line bg-surface-muted px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle">
            <Info aria-hidden className="h-3.5 w-3.5" />
            Existing reservations on this day
          </p>

          {loadingReservations ? (
            <div className="mt-3">
              <Spinner label="Checking availability…" />
            </div>
          ) : reservationError ? (
            <p className="mt-3 text-sm text-content-muted">{reservationError}</p>
          ) : reservations && reservations.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm text-content-muted">
              {reservations.map((slot) => (
                <li key={slot.booking_id} className="flex items-center justify-between gap-3">
                  <span>
                    {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                  </span>
                  <Badge tone={slot.status === 'completed' ? 'info' : 'success'}>
                    {slot.status === 'completed' ? 'Completed' : 'Reserved'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-content-muted">
              {resourceId
                ? 'No reservations for this resource on the selected date.'
                : 'Select a resource to see its reservations.'}
            </p>
          )}
        </div>

        {errors.root?.message && <InlineError message={errors.root.message} />}

        <p className="text-xs text-content-subtle">
          {settings
            ? `Bookings need at least ${settings.min_lead_time_minutes} minutes' notice and must align to ${settings.slot_granularity_mins}-minute slots.`
            : 'Booking rules are loaded from institution settings.'}
        </p>
      </form>
    </Modal>
  )
}
