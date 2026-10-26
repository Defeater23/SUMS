import { supabase } from '@/lib/supabase'
import { escapeFilterValue } from '@/lib/utils'
import type { Profile, UserRole } from '@/types/models'

/**
 * User-management data access (administrators only).
 *
 * Reads rely on the `profiles_select_own_or_admin` policy. Role and activation
 * changes go through SECURITY DEFINER functions that also protect against
 * removing the last active administrator, and write an audit event.
 */

export async function fetchProfiles(search?: string): Promise<Profile[]> {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false })

  if (search?.trim()) {
    const needle = escapeFilterValue(search)
    query = query.or(`full_name.ilike.%${needle}%,email.ilike.%${needle}%`)
  }

  const { data, error } = await query.returns<Profile[]>()
  if (error) throw error
  return data ?? []
}

export async function setUserRole(userId: string, role: UserRole): Promise<Profile> {
  const { data, error } = await supabase
    .rpc('set_user_role', { p_user_id: userId, p_role: role })
    .returns<Profile>()

  if (error) throw error
  return data as Profile
}

export async function setUserActive(userId: string, isActive: boolean): Promise<Profile> {
  const { data, error } = await supabase
    .rpc('set_user_active', { p_user_id: userId, p_is_active: isActive })
    .returns<Profile>()

  if (error) throw error
  return data as Profile
}
