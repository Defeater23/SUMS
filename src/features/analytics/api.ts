import { supabase } from '@/lib/supabase'
import type {
  AdminDashboardStats,
  BookingTrendPoint,
  CategoryDistributionPoint,
  DecisionTrendPoint,
  FeedbackSummary,
  MyDashboardStats,
  ResourceUtilizationPoint,
  StatusDistributionPoint,
  TopResourcePoint,
} from '@/types/models'

/**
 * Analytics data access.
 *
 * Every figure is computed by a PostgreSQL function directly from booking
 * records — nothing on the dashboards is hardcoded. The administrator-only
 * functions re-verify `is_admin()` inside the database, so the charts cannot be
 * populated by a non-administrator even through a crafted request.
 *
 * The Supabase client is intentionally untyped, so the untyped `data` payload
 * is narrowed here at the boundary instead of relying on `.returns<T>()`.
 */

/** RPCs that return a single-row table come back as an array of one. */
function first<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0] : null
}

export async function fetchMyDashboardStats(): Promise<MyDashboardStats | null> {
  const { data, error } = await supabase.rpc('fn_my_dashboard_stats')
  if (error) throw error
  return first((data ?? []) as MyDashboardStats[])
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats | null> {
  const { data, error } = await supabase.rpc('fn_admin_dashboard_stats')
  if (error) throw error
  return first((data ?? []) as AdminDashboardStats[])
}

export async function fetchBookingTrends(
  from: string,
  to: string,
): Promise<BookingTrendPoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_booking_trends', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as BookingTrendPoint[]
}

export async function fetchStatusDistribution(
  from: string,
  to: string,
): Promise<StatusDistributionPoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_status_distribution', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as StatusDistributionPoint[]
}

export async function fetchCategoryDistribution(
  from: string,
  to: string,
): Promise<CategoryDistributionPoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_category_distribution', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as CategoryDistributionPoint[]
}

export async function fetchTopResources(
  from: string,
  to: string,
  limit = 8,
): Promise<TopResourcePoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_top_resources', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as TopResourcePoint[]
}

export async function fetchResourceUtilization(
  from: string,
  to: string,
): Promise<ResourceUtilizationPoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_resource_utilization', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as ResourceUtilizationPoint[]
}

export async function fetchDecisionTrends(
  from: string,
  to: string,
): Promise<DecisionTrendPoint[]> {
  const { data, error } = await supabase.rpc('fn_analytics_decision_trends', {
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return (data ?? []) as DecisionTrendPoint[]
}

export async function fetchFeedbackSummary(): Promise<FeedbackSummary | null> {
  const { data, error } = await supabase.rpc('fn_feedback_summary')
  if (error) throw error
  return first((data ?? []) as FeedbackSummary[])
}
