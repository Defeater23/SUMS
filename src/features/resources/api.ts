import { supabase } from '@/lib/supabase'
import { escapeFilterValue } from '@/lib/utils'
import type { Resource, ResourceCategory, ResourceWithCategory } from '@/types/models'
import type { ResourceValues } from '@/lib/validation'

/**
 * Resource catalogue data access.
 *
 * Reads are governed by Row Level Security (any signed-in user may read the
 * catalogue). Writes are additionally restricted to administrators by the
 * `resources_*_admin` policies, so a non-admin request fails in the database
 * even though the UI hides the controls.
 */

const RESOURCE_SELECT = '*, category:resource_categories(id, name)'

export interface ResourceFilters {
  search?: string
  categoryId?: string | null
  building?: string | null
  minCapacity?: number | null
  /** Only return resources that are currently bookable. */
  activeOnly?: boolean
}

export async function fetchResources(
  filters: ResourceFilters = {},
): Promise<ResourceWithCategory[]> {
  let query = supabase.from('resources').select(RESOURCE_SELECT).order('name', { ascending: true })

  if (filters.activeOnly) query = query.eq('is_active', true)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.building) query = query.eq('building', filters.building)
  if (typeof filters.minCapacity === 'number') query = query.gte('capacity', filters.minCapacity)
  if (filters.search) {
    query = query.ilike('name', `%${escapeFilterValue(filters.search)}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ResourceWithCategory[]
}

export async function fetchResource(id: string): Promise<ResourceWithCategory> {
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('That resource could not be found or is no longer available.')
  return data as ResourceWithCategory
}

export async function fetchResourceCategories(): Promise<ResourceCategory[]> {
  const { data, error } = await supabase
    .from('resource_categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as ResourceCategory[]
}

/** Distinct buildings, used to populate the location filter. */
export async function fetchBuildings(): Promise<string[]> {
  const { data, error } = await supabase
    .from('resources')
    .select('building')
    .not('building', 'is', null)

  if (error) throw error
  const unique = new Set<string>()
  for (const row of (data ?? []) as Array<{ building: string | null }>) {
    const value = row.building?.trim()
    if (value) unique.add(value)
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b))
}

/** Converts a validated form payload into the columns the table expects. */
export function toResourcePayload(values: ResourceValues) {
  const capacity =
    values.capacity === '' || values.capacity === undefined ? null : Number(values.capacity)

  const equipment = (values.equipment ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return {
    name: values.name.trim(),
    description: values.description?.trim() || null,
    category_id: values.category_id || null,
    building: values.building?.trim() || null,
    location: values.location?.trim() || null,
    capacity,
    equipment,
    image_url: values.image_url?.trim() || null,
    requires_approval: values.requires_approval,
    opens_at: values.opens_at.length === 5 ? `${values.opens_at}:00` : values.opens_at,
    closes_at: values.closes_at.length === 5 ? `${values.closes_at}:00` : values.closes_at,
    min_booking_minutes: Number(values.min_booking_minutes),
    max_booking_minutes: Number(values.max_booking_minutes),
    advance_days: Number(values.advance_days),
    is_active: values.is_active,
  }
}

export async function createResource(
  values: ResourceValues,
  createdBy: string | null,
): Promise<Resource> {
  const { data, error } = await supabase
    .from('resources')
    .insert({ ...toResourcePayload(values), created_by: createdBy })
    .select('*')
    .single()

  if (error) throw error
  return data as Resource
}

export async function updateResource(id: string, values: ResourceValues): Promise<Resource> {
  const { data, error } = await supabase
    .from('resources')
    .update(toResourcePayload(values))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Resource
}

/**
 * Resources are deactivated rather than deleted so historical bookings survive.
 */
export async function setResourceActive(id: string, isActive: boolean): Promise<Resource> {
  const { data, error } = await supabase
    .from('resources')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Resource
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('resources').delete().eq('id', id)
  if (error) throw error
}
