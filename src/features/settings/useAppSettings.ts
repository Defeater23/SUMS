import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchAppSettings } from './api'

/**
 * Institution settings are readable by every signed-in user, so the booking UI
 * can apply exactly the same rules the database enforces.
 */
export function useAppSettings() {
  return useAsyncData('app-settings', fetchAppSettings)
}
