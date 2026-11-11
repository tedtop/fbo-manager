import { type FaaRegistration, fetchFaaRegistration, isUsTail, mapFaaToIcao } from '@/lib/faa-registry'
import { findIcaoType, formatIcaoType } from '@/lib/icao-aircraft-types'

export interface AircraftLookupResult {
  tail: string
  icao24: string | null
  typeIcao: string
  typeDescription: string
  manufacturer: string | null
  /** Registered owner, for display only. Never log it or persist it to the database. */
  owner: string | null
  ownerCountry: string | null
  /** https image URL from airport-data.com, null when there is no photo. */
  photoUrl: string | null
  photoThumbUrl: string | null
  source: 'adsbdb' | 'faa'
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

function httpsUrl(value: unknown): string | null {
  const url = text(value)
  return url?.startsWith('https://') ? url : null
}

/**
 * Looks the aircraft type up from the registration: adsbdb first, then (US tails
 * only, when adsbdb has nothing) the FAA registry, B86. Returns null for
 * unknown tails, empty tails, non-200 responses, network errors and timeouts.
 * The registered owner and photo are returned for display only: the owner must
 * not be logged or persisted to the database.
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
  // A failed adsbdb call (network, 5xx) is not cached, so a transient outage is retried.
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
          owner: text(aircraft.registered_owner),
          ownerCountry: text(aircraft.registered_owner_country_name),
          photoUrl: httpsUrl(aircraft.url_photo),
          photoThumbUrl: httpsUrl(aircraft.url_photo_thumbnail),
          source: 'adsbdb'
        }
      }
    }
  } catch {
    // network error, timeout or malformed JSON: treated as no result
  }

  if (!result && isUsTail(normalized)) {
    const reg = await fetchFaaRegistration(normalized, fetchImpl)
    if (reg === undefined) cacheable = false
    else result = faaResult(normalized, reg)
  }

  if (useCache && cacheable) remember(normalized, result)
  return result
}

function faaResult(
  tail: string,
  reg: FaaRegistration | null
): AircraftLookupResult | null {
  if (!reg) return null
  const typeIcao = mapFaaToIcao(reg.manufacturer, reg.model)
  const type = typeIcao ? findIcaoType(typeIcao) : undefined
  if (!typeIcao || !type) return null
  return {
    tail,
    icao24: reg.modeSHex,
    typeIcao,
    typeDescription: formatIcaoType(type),
    manufacturer: type.manufacturer,
    owner: reg.owner,
    ownerCountry: 'United States',
    photoUrl: null,
    photoThumbUrl: null,
    source: 'faa'
  }
}
