import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AppLoader } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Link } from 'react-router-dom'
import type { UserRole } from '@/types/models'

/** Redirects unauthenticated visitors to the sign-in page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) return <AppLoader label="Restoring your session…" />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

/**
 * Role gate for administrator-only screens. This is a usability measure only —
 * the server re-checks every action through Row Level Security and the
 * SECURITY DEFINER functions.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { profile, profileLoading } = useAuth()

  if (!profile && profileLoading) return <AppLoader label="Checking your permissions…" />
  if (!profile || !roles.includes(profile.role)) return <ForbiddenPage />
  return <>{children}</>
}

/** Sends signed-in users away from the guest-only pages. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth()

  if (loading) return <AppLoader label="Restoring your session…" />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export function ForbiddenPage() {
  return (
    <Card className="card-pad mx-auto max-w-lg text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
        <ShieldAlert aria-hidden className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-content">Administrator access required</h1>
      <p className="mt-1 text-sm text-content-muted">
        Your account does not have permission to open this page. If you believe this is a mistake,
        ask an administrator to review your role.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/">
          <Button variant="primary">Back to dashboard</Button>
        </Link>
      </div>
    </Card>
  )
}

export function NotFoundPage() {
  return (
    <Card className="card-pad mx-auto max-w-lg text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-content-subtle">404</p>
      <h1 className="mt-2 text-lg font-semibold text-content">Page not found</h1>
      <p className="mt-1 text-sm text-content-muted">
        The page you were looking for does not exist or has been moved.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link to="/">
          <Button variant="primary">Back to dashboard</Button>
        </Link>
      </div>
    </Card>
  )
}
