'use client'

import type { AircraftLookupResult } from '@/lib/aircraft-lookup'
import { useQuery } from '@tanstack/react-query'

const LOOKUP_URL = '/api/aircraft/lookup'

export const aircraftLookupKeys = {
  tail: (tail: string) => ['aircraft-type-lookup', tail] as const
}

async function fetchLookup(tail: string): Promise<AircraftLookupResult | null> {
  const res = await fetch(`${LOOKUP_URL}?tail=${encodeURIComponent(tail)}`)
  if (!res.ok) throw new Error(`Aircraft lookup failed (${res.status})`)
  const body = (await res.json()) as { result: AircraftLookupResult | null }
  return body.result
}

/**
 * Registry lookup of the aircraft type for a tail number (adsbdb via
 * /api/aircraft/lookup). Pass null/undefined/empty to stay idle.
 * `data` is null when the tail is unknown, the lookup failed or nothing was requested.
 * `result` and `isLoading` are aliases of `data` and `isFetching`.
 */
export function useAircraftTypeLookup(tail: string | null | undefined) {
  const normalized = tail?.trim().toUpperCase() ?? ''
  const query = useQuery({
    queryKey: aircraftLookupKeys.tail(normalized),
    queryFn: () => fetchLookup(normalized),
    enabled: normalized.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false
  })

  const data = query.data ?? null
  return {
    data,
    isFetching: query.isFetching,
    isError: query.isError,
    result: data,
    isLoading: query.isFetching
  }
}
