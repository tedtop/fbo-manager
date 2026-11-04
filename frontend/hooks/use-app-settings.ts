'use client'

import {
  DEFAULT_APP_SETTINGS,
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

  return {
    settings,
    loading: query.isLoading,
    error: query.error,
    saveTailPrefix
  }
}
