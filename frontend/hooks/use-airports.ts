'use client'

import { useAppSettings } from '@/hooks/use-app-settings'
import { createClient } from '@/lib/supabase/client'
import { getAirportByCode, searchAirports } from '@/repositories/airports.repo'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

export const airportKeys = {
  all: ['airports'] as const,
  search: (query: string, homeCountry: string) =>
    [...airportKeys.all, 'search', query, homeCountry] as const,
  byCode: (code: string) => [...airportKeys.all, 'code', code] as const
}

/** Picker results for the typed text, best first (exact codes, then prefixes, then name/city). */
export function useAirportSearch(query: string, homeCountry: string) {
  const db = createClient()
  const text = query.trim()
  return useQuery({
    queryKey: airportKeys.search(text.toUpperCase(), homeCountry),
    queryFn: () => searchAirports(db, text, 20, homeCountry),
    enabled: text.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000
  })
}

/** The airport for a stored code (e.g. KGPI), or null for free text / unknown strips. */
export function useAirport(code: string | undefined) {
  const db = createClient()
  return useQuery({
    queryKey: airportKeys.byCode(code ?? ''),
    queryFn: () => getAirportByCode(db, code ?? ''),
    enabled: !!code,
    staleTime: 60 * 60 * 1000
  })
}

/**
 * The airport settings with the home airport's country (US until it loads): what the picker needs to rank
 * home-country airports first and which code to display.
 */
export function useAirportSettings() {
  const { settings } = useAppSettings()
  const home = useAirport(settings.homeAirport)
  return {
    homeAirport: settings.homeAirport,
    displayPreference: settings.airportDisplay,
    homeCountry: home.data?.country ?? 'US'
  }
}
