'use client'

import {
  AIRPORT_DISPLAY_KEY,
  type AirportDisplay,
  DEFAULT_APP_SETTINGS,
  EQUIPMENT_TYPES_KEY,
  type EquipmentTypeDef,
  HOME_AIRPORT_KEY,
  TAIL_NUMBER_PREFIX_KEY,
  normalizeTailPrefix,
  settingsFromRows
} from '@/lib/app-settings'
import { createClient } from '@/lib/supabase/client'
import {
  findAllAppSettings,
  upsertAppSetting
} from '@/repositories/app-settings.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const appSettingKeys = {
  all: ['app-settings'] as const
}

/**
 * App-wide settings with the built-in defaults applied. Never blocks or fails the screen using it: while
 * loading, or if the table cannot be read, the defaults are returned.
 */
export function useAppSettings() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: appSettingKeys.all,
    queryFn: () => findAllAppSettings(db),
    staleTime: 5 * 60 * 1000
  })

  const settings = query.data
    ? settingsFromRows(query.data)
    : DEFAULT_APP_SETTINGS

  const saveTailPrefix = useMutation({
    mutationFn: (prefix: string) =>
      upsertAppSetting(db, TAIL_NUMBER_PREFIX_KEY, normalizeTailPrefix(prefix)),
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingKeys.all })
  })

  const saveEquipmentTypes = useMutation({
    mutationFn: (types: EquipmentTypeDef[]) =>
      upsertAppSetting(db, EQUIPMENT_TYPES_KEY, types),
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingKeys.all })
  })

  const saveHomeAirport = useMutation({
    mutationFn: (code: string) => upsertAppSetting(db, HOME_AIRPORT_KEY, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingKeys.all })
  })

  const saveAirportDisplay = useMutation({
    mutationFn: (display: AirportDisplay) =>
      upsertAppSetting(db, AIRPORT_DISPLAY_KEY, display),
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingKeys.all })
  })

  return {
    settings,
    loading: query.isLoading,
    error: query.error,
    saveTailPrefix,
    saveEquipmentTypes,
    saveHomeAirport,
    saveAirportDisplay
  }
}
