import { describe, expect, it } from 'vitest'
import { navItemsForRole, NAV_ITEMS } from '@/components/layout/navigation'

/**
 * The navigation hides administrator destinations from other roles.
 * This is a usability layer — the server re-checks every request — but the
 * expectation still guards against accidentally exposing an admin entry.
 */
describe('navigation items', () => {
  it('exposes all nine destinations', () => {
    const labels = NAV_ITEMS.map((item) => item.label)
    expect(labels).toEqual([
      'Dashboard',
      'Resources',
      'Bookings',
      'Approvals',
      'Notifications',
      'Analytics',
      'Feedback',
      'User Management',
      'Settings',
    ])
  })

  it('shows administrators every destination', () => {
    expect(navItemsForRole('admin')).toHaveLength(NAV_ITEMS.length)
  })

  it('hides administrator-only destinations from students', () => {
    const destinations = navItemsForRole('student').map((item) => item.to)
    expect(destinations).not.toContain('/approvals')
    expect(destinations).not.toContain('/analytics')
    expect(destinations).not.toContain('/users')
    expect(destinations).toContain('/resources')
    expect(destinations).toContain('/bookings')
    expect(destinations).toContain('/notifications')
    expect(destinations).toContain('/feedback')
    expect(destinations).toContain('/settings')
  })

  it('hides administrator-only destinations from faculty', () => {
    const destinations = navItemsForRole('faculty').map((item) => item.to)
    expect(destinations).not.toContain('/approvals')
    expect(destinations).not.toContain('/users')
  })

  it('only offers public destinations to a visitor without a profile', () => {
    const destinations = navItemsForRole(null).map((item) => item.to)
    expect(destinations).not.toContain('/approvals')
    expect(destinations).toContain('/resources')
  })
})
