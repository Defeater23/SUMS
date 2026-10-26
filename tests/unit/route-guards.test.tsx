import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireAuth, RequireRole } from '@/routes/guards'
import type { UserRole } from '@/types/models'

/**
 * The route guards decide what the interface shows, but they are not the
 * security boundary — Row Level Security and the SECURITY DEFINER functions
 * enforce authorization in PostgreSQL. These tests check the UI contract only.
 */
const state = vi.hoisted(() => ({
  value: {
    loading: false,
    profileLoading: false,
    isAuthenticated: true,
    profile: null as { id: string; role: UserRole } | null,
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => state.value,
}))

function setState(next: Partial<typeof state.value>) {
  state.value = { ...state.value, ...next }
}

function renderAt(path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Sign-in page</p>} />
        <Route path="/" element={<p>Dashboard page</p>} />
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireRole', () => {
  it('renders the page for a permitted role', () => {
    setState({ profile: { id: 'u1', role: 'admin' }, profileLoading: false })
    renderAt('/analytics', <RequireRole roles={['admin']}>Analytics content</RequireRole>)

    expect(screen.getByText('Analytics content')).toBeInTheDocument()
  })

  it('shows the forbidden page when a student opens an administrator route', () => {
    setState({ profile: { id: 'u2', role: 'student' }, profileLoading: false })
    renderAt('/analytics', <RequireRole roles={['admin']}>Analytics content</RequireRole>)

    expect(screen.queryByText('Analytics content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /administrator access required/i })).toBeInTheDocument()
  })

  it('shows the forbidden page when faculty opens user management', () => {
    setState({ profile: { id: 'u3', role: 'faculty' }, profileLoading: false })
    renderAt('/users', <RequireRole roles={['admin']}>User management</RequireRole>)

    expect(screen.queryByText('User management')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /administrator access required/i })).toBeInTheDocument()
  })

  it('waits while the profile is still loading', () => {
    setState({ profile: null, profileLoading: true })
    renderAt('/analytics', <RequireRole roles={['admin']}>Analytics content</RequireRole>)

    expect(screen.queryByText('Analytics content')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('RequireAuth', () => {
  it('sends signed-out visitors to the sign-in page', () => {
    setState({ isAuthenticated: false, profile: null, loading: false })
    renderAt('/bookings', <RequireAuth>Booking list</RequireAuth>)

    expect(screen.getByText('Sign-in page')).toBeInTheDocument()
    expect(screen.queryByText('Booking list')).not.toBeInTheDocument()
  })

  it('renders protected content for a signed-in user', () => {
    setState({ isAuthenticated: true, loading: false })
    renderAt('/bookings', <RequireAuth>Booking list</RequireAuth>)

    expect(screen.getByText('Booking list')).toBeInTheDocument()
  })

  it('holds rendering while the session is being restored', () => {
    setState({ isAuthenticated: false, loading: true })
    renderAt('/bookings', <RequireAuth>Booking list</RequireAuth>)

    expect(screen.queryByText('Sign-in page')).not.toBeInTheDocument()
    expect(screen.queryByText('Booking list')).not.toBeInTheDocument()
  })
})

describe('GuestOnly', () => {
  it('redirects a signed-in user away from the guest page', () => {
    setState({ isAuthenticated: true, loading: false })
    renderAt('/signin', <GuestOnly>Sign-in form</GuestOnly>)

    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('lets a signed-out visitor see the guest page', () => {
    setState({ isAuthenticated: false, loading: false })
    renderAt('/signin', <GuestOnly>Sign-in form</GuestOnly>)

    expect(screen.getByText('Sign-in form')).toBeInTheDocument()
  })
})
