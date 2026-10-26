import { Route, Routes } from 'react-router-dom'
import { supabaseConfig } from '@/lib/supabase'
import { AppLayout } from '@/components/layout/AppLayout'
import { GuestOnly, NotFoundPage, RequireAuth, RequireRole } from '@/routes/guards'
import { ConfigurationRequiredPage } from '@/features/auth/ConfigurationRequiredPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage'
import { BookingsPage } from '@/features/bookings/BookingsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FeedbackPage } from '@/features/feedback/FeedbackPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { ResourceDetailPage } from '@/features/resources/ResourceDetailPage'
import { ResourcesPage } from '@/features/resources/ResourcesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { UsersPage } from '@/features/users/UsersPage'

/**
 * Application route tree.
 *
 * Route guards are a usability layer only — every read and write is authorised
 * again by Row Level Security and the SECURITY DEFINER functions in PostgreSQL.
 */
export function App() {
  // Without Supabase there is no data layer at all, so the interface is not
  // rendered rather than being backed by placeholder content.
  if (!supabaseConfig.isConfigured) return <ConfigurationRequiredPage />

  return (
    <Routes>
      {/* Guest-only routes. /reset-password is intentionally unguarded: the
          recovery link signs the user in before they choose a new password. */}
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestOnly>
            <ForgotPasswordPage />
          </GuestOnly>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Authenticated application shell. */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/resources/:resourceId" element={<ResourceDetailPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route
          path="/approvals"
          element={
            <RequireRole roles={['admin']}>
              <ApprovalsPage />
            </RequireRole>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/analytics"
          element={
            <RequireRole roles={['admin']}>
              <AnalyticsPage />
            </RequireRole>
          }
        />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route
          path="/users"
          element={
            <RequireRole roles={['admin']}>
              <UsersPage />
            </RequireRole>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
