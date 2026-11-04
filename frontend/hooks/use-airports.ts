'use client'

import { useAppSettings } from '@/hooks/use-app-settings'
import {
  type AirportDisplayPreference,
  displayCode,
  indexAirportsByCode,
  storedCode
} from '@/lib/airports'
import { createClient } from '@/lib/supabase/client'
import {
  findAirportsByCodes,
  getAirportByCode,
  searchAirports
} from '@/repositories/airports.repo'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

export const airportKeys = {
  all: ['airports'] as const,
  search: (query: string, homeCountry: string) =>
    [...airportKeys.all, 'search', query, homeCountry] as const,
  byCode: (code: string) => [...airportKeys.all, 'code', code] as const,
  labels: (codes: string[]) => [...airportKeys.all, 'labels', ...codes] as const
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

export type AirportLabel = { text: string; title?: string }

/**
 * Labels for the codes on a list of flights from ONE query (not one per card). `label(code)` is the
 * preferred display code with the stored ICAO as the tooltip; a code with no airport (free text, an
 * unknown strip, still loading) is shown as stored.
 */
export function useAirportLabels(
  codes: (string | null | undefined)[],
  displayPreference: AirportDisplayPreference,
  homeCountry: string
) {
  const db = createClient()
  const unique = [
    ...new Set(codes.map((c) => c?.trim().toUpperCase()).filter(Boolean))
  ].sort() as string[]
  const { data: rows } = useQuery({
    queryKey: airportKeys.labels(unique),
    queryFn: () => findAirportsByCodes(db, unique),
    enabled: unique.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60 * 60 * 1000
  })
  const index = indexAirportsByCode(rows ?? [], unique, { homeCountry })

  return (code: string | null | undefined): AirportLabel | null => {
    const raw = code?.trim()
    if (!raw) return null
    const airport = index.get(raw.toUpperCase())
    if (!airport) return { text: raw }
    return {
      text: displayCode(airport, displayPreference),
      title: `${storedCode(airport)} · ${airport.name}`
    }
  }
}
