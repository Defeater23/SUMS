import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '@/types/models'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** When present, the item is only shown to these roles. */
  roles?: UserRole[]
  end?: boolean
  description: string
}

/**
 * Main navigation. Visibility mirrors the server-side authorization rules:
 * administrator-only destinations are hidden from other roles, and the server
 * rejects them even if the URL is typed directly.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    end: true,
    description: 'Your bookings, requests and activity at a glance',
  },
  {
    to: '/resources',
    label: 'Resources',
    icon: Building2,
    description: 'Browse rooms, labs and bookable equipment',
  },
  {
    to: '/bookings',
    label: 'Bookings',
    icon: CalendarDays,
    description: 'Create, review and cancel bookings',
  },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: CheckSquare,
    roles: ['admin'],
    description: 'Review pending booking requests',
  },
  {
    to: '/notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Updates about your bookings',
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['admin'],
    description: 'Utilisation, trends and administrative reports',
  },
  {
    to: '/feedback',
    label: 'Feedback',
    icon: MessageSquare,
    description: 'Share and review service feedback',
  },
  {
    to: '/users',
    label: 'User Management',
    icon: Users,
    roles: ['admin'],
    description: 'Manage accounts and role assignments',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    description: 'Your profile, appearance and institution rules',
  },
]

export function navItemsForRole(role: UserRole | null): NavItem[] {
  if (!role) return NAV_ITEMS.filter((item) => !item.roles)
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}
