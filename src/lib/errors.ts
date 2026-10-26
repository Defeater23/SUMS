import type { PostgrestError } from '@supabase/supabase-js'

type ErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
  error_description?: string
  status?: number
}

/**
 * PostgreSQL / Supabase error codes that should be translated for humans.
 * Messages raised by our own business-logic functions are already written for
 * end users and are passed through untouched.
 */
const CODE_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists.',
  '23503': 'A referenced record is missing or is still in use.',
  '23514': 'One of the values is outside the allowed range.',
  '23P01': 'That time slot has already been reserved. Please choose another slot.',
  '42501': 'You do not have permission to perform this action.',
  '28000': 'You need to sign in to continue.',
  'P0002': 'The requested record could not be found.',
  '57014': 'The request took too long. Please try again.',
}

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email address or password.',
  'Email not confirmed': 'Please confirm your email address before signing in.',
  'User already registered': 'An account with that email address already exists.',
  'Password should be at least 6 characters': 'Use a password of at least 8 characters.',
  'Email rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'For security purposes, you can only request this after 60 seconds.':
    'For security reasons please wait a minute before trying again.',
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

/** Turns any thrown value into a safe, human-readable message. */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (typeof error === 'string') return error
  if (error instanceof SyntaxError) return 'The server returned an unexpected response.'

  const candidate = error as ErrorLike

  if (candidate.error_description) return candidate.error_description
  if (candidate.code && CODE_MESSAGES[candidate.code]) return CODE_MESSAGES[candidate.code]
  if (candidate.message && AUTH_MESSAGES[candidate.message]) return AUTH_MESSAGES[candidate.message]
  if (candidate.message) {
    // Never surface raw SQL or secrets to the user.
    if (/^ERROR:|syntax error|relation "|column "/i.test(candidate.message)) {
      return 'The request could not be completed. Please try again.'
    }
    return candidate.message
  }

  return 'Something went wrong. Please try again.'
}

/** True when the failure is a lost double-booking race. */
export function isUnavailableError(error: unknown): boolean {
  if (!isPostgrestError(error)) return false
  return error.code === '23P01' || error.code === 'P0001'
}

export function isPermissionError(error: unknown): boolean {
  if (!isPostgrestError(error)) return false
  return error.code === '42501' || error.code === '28000'
}

/** Logging helper that strips potentially sensitive payloads. */
export function logError(context: string, error: unknown): void {
  const candidate = error as ErrorLike
  // eslint-disable-next-line no-console
  console.error(`[sums] ${context}`, {
    message: candidate?.message,
    code: candidate?.code,
  })
}
