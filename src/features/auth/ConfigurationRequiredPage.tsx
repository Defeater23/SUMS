import { AlertTriangle, Database, KeyRound } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'

/**
 * Rendered instead of the application when the Supabase environment variables
 * are missing. The app deliberately does not fall back to mock data — every
 * feature is backed by the real database.
 */
export function ConfigurationRequiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-5 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <Logo />

        <div className="card card-pad">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertTriangle aria-hidden className="h-5 w-5" />
          </span>

          <h1 className="mt-4 text-xl font-semibold text-content">
            Connect SUMS to a Supabase project
          </h1>
          <p className="mt-2 text-sm text-content-muted">
            SUMS is a fully database-backed application: bookings, approvals, notifications,
            analytics and feedback all live in PostgreSQL with Row Level Security. Until a project
            is connected, no data can be read or written, so the interface is not shown.
          </p>

          <ol className="mt-6 space-y-4 text-sm text-content-muted">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-content-subtle">
                <Database aria-hidden className="h-4 w-4" />
              </span>
              <span>
                <strong className="block text-content">1. Create a Supabase project</strong>
                Any PostgreSQL 15 project works. Note the project URL and the publishable key.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-content-subtle">
                <KeyRound aria-hidden className="h-4 w-4" />
              </span>
              <span>
                <strong className="block text-content">2. Add the environment variables</strong>
                Copy <code className="rounded bg-surface-muted px-1.5 py-0.5">.env.example</code> to{' '}
                <code className="rounded bg-surface-muted px-1.5 py-0.5">.env</code> and set{' '}
                <code className="rounded bg-surface-muted px-1.5 py-0.5">VITE_SUPABASE_URL</code> and{' '}
                <code className="rounded bg-surface-muted px-1.5 py-0.5">VITE_SUPABASE_ANON_KEY</code>,
                then restart the dev server.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-content-subtle">
                <AlertTriangle aria-hidden className="h-4 w-4" />
              </span>
              <span>
                <strong className="block text-content">3. Apply the migrations</strong>
                Run the SQL files in <code className="rounded bg-surface-muted px-1.5 py-0.5">supabase/migrations</code>{' '}
                in filename order, then <code className="rounded bg-surface-muted px-1.5 py-0.5">supabase/seed.sql</code>.
                See the README for the exact commands.
              </span>
            </li>
          </ol>

          <p className="mt-6 rounded-lg border border-line bg-surface-muted px-4 py-3 text-xs text-content-muted">
            The service-role key is never required by the frontend and must never be placed in a{' '}
            <code>VITE_</code> variable.
          </p>
        </div>
      </div>
    </div>
  )
}
