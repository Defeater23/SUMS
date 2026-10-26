import { supabase } from '@/lib/supabase'
import type { AppSettings, ResourceCategory } from '@/types/models'
import type { CategoryValues, SettingsValues } from '@/lib/validation'

/**
 * Institution settings and category management.
 *
 * The settings row is readable by every signed-in user (so the booking form can
 * apply the same rules) but only administrators may update it.
 */

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Institution settings have not been configured yet.')
  return data as AppSettings
}

export async function updateAppSettings(values: SettingsValues): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .update({
      institution_name: values.institution_name.trim(),
      timezone: values.timezone.trim(),
      booking_open_hour: Number(values.booking_open_hour),
      booking_close_hour: Number(values.booking_close_hour),
      allow_weekends: values.allow_weekends,
      min_lead_time_minutes: Number(values.min_lead_time_minutes),
      cancellation_cutoff_mins: Number(values.cancellation_cutoff_mins),
      slot_granularity_mins: Number(values.slot_granularity_mins),
      auto_approve_roles: values.auto_approve_roles,
    })
    .eq('id', true)
    .select('*')
    .single()

  if (error) throw error
  return data as AppSettings
}

export async function createCategory(values: CategoryValues): Promise<ResourceCategory> {
  const { data, error } = await supabase
    .from('resource_categories')
    .insert({ name: values.name.trim(), description: values.description?.trim() || null })
    .select('*')
    .single()

  if (error) throw error
  return data as ResourceCategory
}

export async function updateCategory(
  id: string,
  values: CategoryValues,
): Promise<ResourceCategory> {
  const { data, error } = await supabase
    .from('resource_categories')
    .update({ name: values.name.trim(), description: values.description?.trim() || null })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as ResourceCategory
}

/** Deleting a category leaves its resources intact (the FK sets null). */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('resource_categories').delete().eq('id', id)
  if (error) throw error
}
