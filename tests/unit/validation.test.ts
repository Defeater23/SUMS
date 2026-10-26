import { describe, expect, it } from 'vitest'
import {
  bookingSchema,
  combineDateAndTime,
  normaliseTime,
  registerSchema,
  resourceSchema,
  settingsSchema,
} from '@/lib/validation'

const validResource = {
  name: 'Physics Laboratory',
  description: '',
  category_id: '',
  building: 'Block B',
  location: 'Room 210',
  capacity: 40,
  equipment: 'Projector',
  image_url: '',
  requires_approval: true,
  is_active: true,
  opens_at: '08:00',
  closes_at: '20:00',
  min_booking_minutes: 30,
  max_booking_minutes: 180,
  advance_days: 30,
}

describe('registration schema', () => {
  const base = {
    fullName: 'Ada Lovelace',
    email: 'ada@university.edu',
    department: 'Physics',
    role: 'student' as const,
    password: 'supersecret',
    confirmPassword: 'supersecret',
  }

  it('accepts a student registration', () => {
    expect(registerSchema.safeParse(base).success).toBe(true)
  })

  it('does not allow self-registration as an administrator', () => {
    const result = registerSchema.safeParse({ ...base, role: 'admin' })
    expect(result.success).toBe(false)
  })

  it('rejects mismatched passwords and short passwords', () => {
    expect(registerSchema.safeParse({ ...base, confirmPassword: 'different1' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' }).success).toBe(
      false,
    )
  })
})

describe('resource schema', () => {
  it('accepts a well-formed resource', () => {
    const result = resourceSchema.safeParse(validResource)
    expect(result.success).toBe(true)
  })

  it('rejects a closing time before the opening time', () => {
    const result = resourceSchema.safeParse({ ...validResource, opens_at: '20:00', closes_at: '08:00' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('closes_at'))).toBe(true)
    }
  })

  it('rejects a minimum duration greater than the maximum', () => {
    const result = resourceSchema.safeParse({
      ...validResource,
      min_booking_minutes: 120,
      max_booking_minutes: 60,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-positive capacity', () => {
    expect(resourceSchema.safeParse({ ...validResource, capacity: 0 }).success).toBe(false)
  })
})

describe('booking schema', () => {
  it('accepts a valid request', () => {
    const result = bookingSchema.safeParse({
      resource_id: '22222222-2222-4222-8222-222222222222',
      date: '2026-02-14',
      start_time: '09:00',
      end_time: '10:30',
      purpose: 'Revision session',
      attendees: 25,
    })
    expect(result.success).toBe(true)
  })

  it('requires a real resource identifier and an ISO date', () => {
    expect(
      bookingSchema.safeParse({
        resource_id: 'not-a-uuid',
        date: '14/02/2026',
        start_time: '09:00',
        end_time: '10:00',
      }).success,
    ).toBe(false)
  })
})

describe('settings schema', () => {
  const base = {
    institution_name: 'Northfield University',
    timezone: 'Asia/Kolkata',
    booking_open_hour: 8,
    booking_close_hour: 20,
    allow_weekends: false,
    min_lead_time_minutes: 30,
    cancellation_cutoff_mins: 120,
    slot_granularity_mins: 30,
    auto_approve_roles: ['faculty'] as const,
  }

  it('accepts valid institution rules', () => {
    expect(settingsSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a closing hour that is not after the opening hour', () => {
    expect(settingsSchema.safeParse({ ...base, booking_open_hour: 20, booking_close_hour: 8 }).success).toBe(
      false,
    )
  })

  it('rejects an unknown role in the auto-approval list', () => {
    expect(settingsSchema.safeParse({ ...base, auto_approve_roles: ['superuser'] }).success).toBe(false)
  })
})

describe('time helpers', () => {
  it('normalises an HTML time input to a full time string', () => {
    expect(normaliseTime('09:30')).toBe('09:30:00')
    expect(normaliseTime('09:30:00')).toBe('09:30:00')
  })

  it('combines a date and time into an ISO timestamp in the local zone', () => {
    const iso = combineDateAndTime('2026-02-14', '09:30')
    expect(new Date(iso).getHours()).toBe(9)
    expect(new Date(iso).getMinutes()).toBe(30)
  })

  it('throws for an impossible date instead of producing an invalid date', () => {
    expect(() => combineDateAndTime('not-a-date', '09:30')).toThrow()
  })
})
