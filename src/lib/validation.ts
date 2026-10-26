import { z } from 'zod'

/**
 * Reusable validation contracts shared by every form in the application.
 * The server re-validates all of these rules in PostgreSQL, so the schemas
 * here exist to give fast, friendly feedback — not as the security boundary.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'An email address is required.')
  .email('Enter a valid email address.')
  .max(254, 'That email address is too long.')

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Passwords may be at most 72 characters.')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'A password is required.'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120, 'That name is too long.'),
    email: emailSchema,
    department: z.string().trim().max(120).optional().or(z.literal('')),
    role: z.enum(['student', 'faculty']),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120, 'That name is too long.'),
  department: z.string().trim().max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
})
export type ProfileValues = z.infer<typeof profileSchema>

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use the HH:MM format.')

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name.').max(80, 'That name is too long.'),
  description: z.string().trim().max(400).optional().or(z.literal('')),
})
export type CategoryValues = z.infer<typeof categorySchema>

export const resourceSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a resource name.').max(120, 'That name is too long.'),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
    category_id: z.string().uuid('Choose a category.').or(z.literal('')),
    building: z.string().trim().max(120).optional().or(z.literal('')),
    location: z.string().trim().max(120).optional().or(z.literal('')),
    capacity: z
      .union([z.coerce.number().int('Use a whole number.').min(1, 'Capacity must be positive.'), z.literal('')])
      .optional(),
    equipment: z.string().max(1000).optional().or(z.literal('')),
    image_url: z.string().trim().url('Enter a valid URL.').optional().or(z.literal('')),
    requires_approval: z.boolean(),
    is_active: z.boolean(),
    opens_at: timeSchema,
    closes_at: timeSchema,
    min_booking_minutes: z.coerce
      .number()
      .int()
      .min(5, 'At least 5 minutes.')
      .max(1440, 'At most 1440 minutes.'),
    max_booking_minutes: z.coerce
      .number()
      .int()
      .min(5, 'At least 5 minutes.')
      .max(1440, 'At most 1440 minutes.'),
    advance_days: z.coerce.number().int().min(1, 'At least 1 day.').max(365, 'At most 365 days.'),
  })
  .refine((values) => values.opens_at < values.closes_at, {
    message: 'Closing time must be after opening time.',
    path: ['closes_at'],
  })
  .refine((values) => values.min_booking_minutes <= values.max_booking_minutes, {
    message: 'The minimum duration cannot exceed the maximum.',
    path: ['max_booking_minutes'],
  })
export type ResourceValues = z.infer<typeof resourceSchema>

export const bookingSchema = z.object({
  resource_id: z.string().uuid('Choose a resource.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  start_time: z.string().min(1, 'Choose a start time.'),
  end_time: z.string().min(1, 'Choose an end time.'),
  purpose: z.string().trim().max(500, 'Keep the purpose under 500 characters.').optional().or(z.literal('')),
  attendees: z
    .union([z.coerce.number().int().min(1, 'At least one attendee.'), z.literal('')])
    .optional(),
})
export type BookingFormValues = z.infer<typeof bookingSchema>

export const feedbackSchema = z.object({
  resource_id: z.string().uuid('Choose a resource.'),
  booking_id: z.string().uuid().optional().or(z.literal('')),
  rating: z.coerce.number().int().min(1, 'Choose a rating.').max(5, 'Choose a rating.'),
  comment: z.string().trim().max(1000, 'Keep your comment under 1000 characters.').optional().or(z.literal('')),
})
export type FeedbackValues = z.infer<typeof feedbackSchema>

export const settingsSchema = z
  .object({
    institution_name: z.string().trim().min(2, 'Enter the institution name.').max(120),
    timezone: z.string().trim().min(3, 'Choose a time zone.').max(64),
    booking_open_hour: z.coerce.number().int().min(0).max(23),
    booking_close_hour: z.coerce.number().int().min(1).max(24),
    allow_weekends: z.boolean(),
    min_lead_time_minutes: z.coerce.number().int().min(0).max(10080),
    cancellation_cutoff_mins: z.coerce.number().int().min(0).max(10080),
    slot_granularity_mins: z.coerce.number().int().min(5).max(240),
    auto_approve_roles: z.array(z.enum(['student', 'faculty', 'admin'])),
  })
  .refine((values) => values.booking_open_hour < values.booking_close_hour, {
    message: 'The closing hour must be after the opening hour.',
    path: ['booking_close_hour'],
  })
export type SettingsValues = z.infer<typeof settingsSchema>

/** Helper that converts an HTML time input (`HH:MM`) to a full time string. */
export function normaliseTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

/** Combines a local date + time input into an ISO timestamp. */
export function combineDateAndTime(date: string, time: string): string {
  const normalisedTime = time.length === 5 ? `${time}:00` : time
  const local = new Date(`${date}T${normalisedTime}`)
  if (Number.isNaN(local.getTime())) {
    throw new Error('That date and time combination is not valid.')
  }
  return local.toISOString()
}
