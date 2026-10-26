import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Bell,
  CheckCheck,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react'
import { cn, formatRelative } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'
import { Avatar } from '@/components/ui/Avatar'
import { RoleBadge } from '@/components/ui/Badge'
import { useNotificationsFeed } from '@/features/notifications/useNotificationsFeed'
import { NAV_ITEMS } from './navigation'

export function Topbar({
  collapsed,
  onToggleCollapsed,
  onOpenMobileNav,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenMobileNav: () => void
}) {
  const { profile, session, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const userId = session?.user?.id ?? null
  const { notifications, unreadCount, markRead, marking } = useNotificationsFeed(userId, 8)
  const [signingOut, setSigningOut] = useState(false)

  const activeItem =
    NAV_ITEMS.filter((item) => item.to !== '/' && location.pathname.startsWith(item.to))[0] ??
    NAV_ITEMS.find((item) => item.to === '/')

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        className="hidden lg:inline-flex"
      >
        {collapsed ? (
          <PanelLeftOpen aria-hidden className="h-5 w-5" />
        ) : (
          <PanelLeftClose aria-hidden className="h-5 w-5" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-content">{activeItem?.label ?? 'SUMS'}</p>
        <p className="hidden truncate text-xs text-content-subtle sm:block">
          {activeItem?.description}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? (
          <Sun aria-hidden className="h-5 w-5" />
        ) : (
          <Moon aria-hidden className="h-5 w-5" />
        )}
      </Button>

      <Popover
        label="Notifications"
        panelClassName="w-[22rem]"
        button={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-expanded={open}
            className="relative rounded-lg p-2 text-content-muted transition hover:bg-surface-muted hover:text-content"
          >
            <Bell aria-hidden className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
      >
        {({ close }) => (
          <div>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-content">Notifications</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={unreadCount === 0 || marking}
                onClick={() => void markRead(null)}
                leadingIcon={<CheckCheck aria-hidden className="h-3.5 w-3.5" />}
              >
                Mark all read
              </Button>
            </div>

            <ul className="max-h-80 divide-y divide-line overflow-y-auto scroll-thin">
              {notifications.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-content-muted">
                  You have no notifications yet.
                </li>
              )}
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    to="/notifications"
                    onClick={close}
                    className={cn(
                      'block px-4 py-3 transition hover:bg-surface-muted',
                      !notification.is_read && 'bg-brand-50/60 dark:bg-brand-500/10',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-content">{notification.title}</p>
                      {!notification.is_read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                      )}
                    </div>
                    {notification.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-content-muted">{notification.body}</p>
                    )}
                    <p className="mt-1 text-xs text-content-subtle">
                      {formatRelative(notification.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-t border-line px-4 py-2 text-center">
              <Link
                to="/notifications"
                onClick={close}
                className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                View all notifications
              </Link>
            </div>
          </div>
        )}
      </Popover>

      <Popover
        label="Account"
        panelClassName="w-64"
        button={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Account menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-surface-muted"
          >
            <Avatar name={profile?.full_name} email={profile?.email} className="h-8 w-8 text-xs" />
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block truncate text-sm font-medium text-content">
                {profile?.full_name || 'Account'}
              </span>
              <span className="block truncate text-xs text-content-subtle">{profile?.email}</span>
            </span>
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1">
            <div className="border-b border-line px-4 pb-3 pt-2">
              <p className="truncate text-sm font-semibold text-content">
                {profile?.full_name || 'Account'}
              </p>
              <p className="truncate text-xs text-content-muted">{profile?.email}</p>
              {profile && <div className="mt-2">{<RoleBadge role={profile.role} />}</div>}
            </div>

            <Link
              to="/settings"
              onClick={close}
              className="flex items-center gap-2 px-4 py-2 text-sm text-content-muted transition hover:bg-surface-muted hover:text-content"
            >
              <UserRound aria-hidden className="h-4 w-4" />
              Profile
            </Link>
            <Link
              to="/settings"
              onClick={close}
              className="flex items-center gap-2 px-4 py-2 text-sm text-content-muted transition hover:bg-surface-muted hover:text-content"
            >
              <Settings aria-hidden className="h-4 w-4" />
              Settings
            </Link>

            <div className="mt-1 border-t border-line px-2 py-2">
              <button
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  close()
                  setSigningOut(true)
                  try {
                    await signOut()
                    navigate('/login', { replace: true })
                  } finally {
                    setSigningOut(false)
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </Popover>
    </header>
  )
}
