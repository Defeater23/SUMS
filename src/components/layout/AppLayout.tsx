import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useMediaQuery } from '@/hooks/useAsyncData'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useNotificationsFeed } from '@/features/notifications/useNotificationsFeed'

const COLLAPSE_KEY = 'sums.sidebar.collapsed'

export function AppLayout() {
  const { role, session, accountError } = useAuth()
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  const { unreadCount } = useNotificationsFeed(session?.user?.id ?? null, 1)

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Never leave the drawer open when the viewport grows.
  useEffect(() => {
    if (isDesktop) setMobileOpen(false)
  }, [isDesktop])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <div className="min-h-screen bg-surface-muted">
      <a
        href="#main-content"
        className="sr-only-focusable absolute left-4 top-4 z-50 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
      >
        Skip to main content
      </a>

      <Sidebar
        role={role}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        unreadCount={unreadCount}
      />

      <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <Topbar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          onOpenMobileNav={() => setMobileOpen(true)}
        />

        {accountError && (
          <div
            role="alert"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 sm:px-6"
          >
            {accountError}
          </div>
        )}

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
