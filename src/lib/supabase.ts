import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for the browser.
 *
 * Only the URL and the publishable ("anon") key are read here — both are safe
 * to ship to the browser because every table is protected by Row Level
 * Security. The service-role key is never referenced by frontend code.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const supabaseConfig = {
  url: url ?? '',
  anonKey: anonKey ?? '',
  /** False when the app has not been pointed at a Supabase project yet. */
  isConfigured: Boolean(url && anonKey),
} as const

export const supabase: SupabaseClient = createClient(
  url && url.length > 0 ? url : 'http://127.0.0.1:54321',
  anonKey && anonKey.length > 0 ? anonKey : 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sums.auth.token',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
    global: {
      headers: { 'x-application-name': 'sums' },
    },
  },
)
