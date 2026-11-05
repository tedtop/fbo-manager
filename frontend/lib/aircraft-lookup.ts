export interface AircraftLookupResult {
  tail: string
  icao24: string | null
  typeIcao: string
  typeDescription: string
  manufacturer: string | null
  source: 'adsbdb'
}

const ADSBDB_URL = 'https://api.adsbdb.com/v0/aircraft'
const TIMEOUT_MS = 5000
const CACHE_MAX = 200

export function normalizeTail(tail: string): string {
  return tail.trim().toUpperCase()
}

// Small per-process cache of hits and misses so repeated form opens do not re-query adsbdb.
const cache = new Map<string, AircraftLookupResult | null>()

function remember(key: string, value: AircraftLookupResult | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Looks the aircraft type up from the registration via adsbdb. Returns null for
 * unknown tails, empty tails, non-200 responses, network errors and timeouts.
 * Only type fields are read from the response: the registered owner is never
 * returned or logged.
 */
export async function lookupAircraftType(
  tail: string,
  fetchImpl: typeof fetch = fetch
): Promise<AircraftLookupResult | null> {
  const normalized = normalizeTail(tail)
  if (!normalized) return null

  // Only the default fetch is cached, so tests with an injected fetch stay isolated.
  const useCache = fetchImpl === fetch
  if (useCache && cache.has(normalized)) return cache.get(normalized) ?? null

  let result: AircraftLookupResult | null = null
  let cacheable = false
  try {
    const res = await fetchImpl(
      `${ADSBDB_URL}/${encodeURIComponent(normalized)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } }
    )
    if (res.ok) {
      cacheable = true
      const body = (await res.json()) as {
        response?: { aircraft?: Record<string, unknown> } | string
      }
      const aircraft =
        body && typeof body.response === 'object' ? body.response?.aircraft : undefined
      const typeIcao = text(aircraft?.icao_type)?.toUpperCase()
      if (aircraft && typeIcao) {
        result = {
          tail: normalized,
          icao24: text(aircraft.mode_s),
          typeIcao,
          typeDescription: text(aircraft.type) ?? typeIcao,
          manufacturer: text(aircraft.manufacturer),
          source: 'adsbdb'
        }
      }
    }
  } catch {
    // network error, timeout or malformed JSON: treated as no result
  }

  if (useCache && cacheable) remember(normalized, result)
  return result
}
