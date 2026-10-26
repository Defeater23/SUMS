import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { navItemsForRole } from './navigation'
import type { UserRole } from '@/types/models'
import { Button } from '@/components/ui/Button'

export function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onCloseMobile,
  unreadCount,
  className,
}: {
  role: UserRole | null
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
  unreadCount: number
  className?: string
}) {
  const items = navItemsForRole(role)

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center border-b border-line px-4', collapsed && 'justify-center px-2')}>
        <Logo compact={collapsed} />
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto scroll-thin px-2 py-3">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onCloseMobile}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                      : 'text-content-muted hover:bg-surface-muted hover:text-content',
                  )
                }
              >
                <item.icon aria-hidden className="h-4.5 w-4.5 shrink-0" style={{ height: '1.125rem', width: '1.125rem' }} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.to === '/notifications' && unreadCount > 0 && (
                  <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {collapsed && item.to === '/notifications' && unreadCount > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-600" aria-hidden />
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs leading-relaxed text-content-subtle">
            University Resource Management System
          </p>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block',
          collapsed ? 'w-[68px]' : 'w-64',
          className,
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-slate-900/50 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-raised transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="absolute right-2 top-4 z-10"
          >
            <X aria-hidden className="h-4 w-4" />
          </Button>
          {content}
        </aside>
      </div>
    </>
  )
}
