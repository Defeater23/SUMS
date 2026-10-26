import { describe, expect, it } from 'vitest'
import { getErrorMessage, isPermissionError, isUnavailableError, logError } from '@/lib/errors'

function pgError(code: string, message: string) {
  return {
    code,
    message,
    details: '',
    hint: '',
    name: 'PostgrestError',
  }
}

describe('getErrorMessage', () => {
  it('translates a lost double-booking race into guidance', () => {
    expect(
      getErrorMessage(
        pgError('23P01', 'conflicting key value violates exclusion constraint "bookings_no_overlap"'),
      ),
    ).toBe('That time slot has already been reserved. Please choose another slot.')
  })

  it('translates permission and session failures', () => {
    expect(getErrorMessage(pgError('42501', 'permission denied'))).toBe(
      'You do not have permission to perform this action.',
    )
    expect(getErrorMessage(pgError('28000', 'no session'))).toBe('You need to sign in to continue.')
  })

  it('passes through business messages raised by our own functions', () => {
    const error = pgError('P0001', 'This resource is not available on the selected day.')
    expect(getErrorMessage(error)).toBe('This resource is not available on the selected day.')
  })

  it('never leaks raw SQL or schema details', () => {
    expect(
      getErrorMessage(pgError('42P01', 'ERROR: relation "public.profiles" does not exist')),
    ).toBe('The request could not be completed. Please try again.')
  })

  it('maps Supabase Auth messages to friendlier wording', () => {
    expect(getErrorMessage({ message: 'Invalid login credentials' })).toBe(
      'Incorrect email address or password.',
    )
    expect(getErrorMessage({ message: 'User already registered' })).toBe(
      'An account with that email address already exists.',
    )
  })

  it('handles non-error input safely', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong. Please try again.')
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.')
    expect(getErrorMessage(42)).toBe('Something went wrong. Please try again.')
    expect(getErrorMessage('Network unavailable')).toBe('Network unavailable')
    expect(getErrorMessage(new SyntaxError('Unexpected token <'))).toBe(
      'The server returned an unexpected response.',
    )
  })
})

describe('error classification', () => {
  it('detects a slot that was taken concurrently', () => {
    expect(isUnavailableError(pgError('23P01', 'conflict'))).toBe(true)
    expect(isUnavailableError(pgError('P0001', 'Slot already reserved'))).toBe(true)
    expect(isUnavailableError(pgError('42501', 'permission denied'))).toBe(false)
    expect(isUnavailableError(new Error('boom'))).toBe(false)
  })

  it('detects authorization failures', () => {
    expect(isPermissionError(pgError('42501', 'permission denied'))).toBe(true)
    expect(isPermissionError(pgError('28000', 'no session'))).toBe(true)
    expect(isPermissionError(pgError('23P01', 'conflict'))).toBe(false)
  })
})

describe('logError', () => {
  it('logs only the message and code, never the payload', () => {
    const calls: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      logError('create booking', pgError('23P01', 'conflict'))
    } finally {
      console.error = original
    }

    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toEqual({ message: 'conflict', code: '23P01' })
  })
})
