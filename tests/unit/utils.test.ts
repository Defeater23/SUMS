import { describe, expect, it } from 'vitest'
import {
  cn,
  escapeFilterValue,
  formatDuration,
  initials,
  percentage,
  pluralise,
  shortTime,
  titleCase,
  toDateInputValue,
  toDateTimeInputValue,
} from '@/lib/utils'

describe('cn', () => {
  it('joins class names and lets the last Tailwind utility win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', false && 'hidden', undefined, 'font-medium')).toBe('text-sm font-medium')
  })
})

describe('formatDuration', () => {
  it('renders hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(45)).toBe('45m')
  })

  it('never returns a negative or invalid duration', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(-30)).toBe('0m')
    expect(formatDuration(Number.NaN)).toBe('0m')
  })
})

describe('percentage', () => {
  it('rounds to one decimal place', () => {
    expect(percentage(1, 3)).toBe(33.3)
    expect(percentage(2, 4)).toBe(50)
  })

  it('returns 0 instead of dividing by zero', () => {
    expect(percentage(5, 0)).toBe(0)
  })
})

describe('initials', () => {
  it('uses the first letters of the first two name parts', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('Prince')).toBe('P')
  })

  it('falls back to the email address, then a placeholder', () => {
    expect(initials('', 'ada@university.edu')).toBe('A')
    expect(initials(null)).toBe('?')
  })
})

describe('shortTime', () => {
  it('trims PostgreSQL time values to HH:MM', () => {
    expect(shortTime('09:30:00')).toBe('09:30')
    expect(shortTime('09:30')).toBe('09:30')
    expect(shortTime(null)).toBe('—')
  })
})

describe('date input helpers', () => {
  it('formats a local date for an <input type="date">', () => {
    expect(toDateInputValue(new Date(2026, 1, 14, 9, 30))).toBe('2026-02-14')
  })

  it('formats a local date and time for an <input type="datetime-local">', () => {
    expect(toDateTimeInputValue(new Date(2026, 1, 14, 9, 30))).toBe('2026-02-14T09:30')
  })
})

describe('pluralise and titleCase', () => {
  it('pluralises on anything other than one', () => {
    expect(pluralise(1, 'booking')).toBe('booking')
    expect(pluralise(0, 'booking')).toBe('bookings')
    expect(pluralise(2, 'category', 'categories')).toBe('categories')
  })

  it('upper-cases only the first character', () => {
    expect(titleCase('approved')).toBe('Approved')
  })
})

describe('escapeFilterValue', () => {
  it('strips characters that would break a PostgREST or() filter', () => {
    expect(escapeFilterValue('Lab,A (Block B)')).toBe('Lab A  Block B')
    expect(escapeFilterValue('  Physics Lab  ')).toBe('Physics Lab')
  })
})
