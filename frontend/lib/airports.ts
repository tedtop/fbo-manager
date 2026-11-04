// Airport lookup helpers (B49). Pure: the airport table is searched by the repository, this file decides
// how a typed string is cleaned, how candidates are ranked and which code is stored and shown.
//
// ICAO is the canonical stored code (KMSO). People type IATA (MSO), the FAA identifier or ICAO, so a
// code can match several airports (GPI is both Glacier Park, KGPI, and Guapi, SKGP): every exact match is
// returned and the home country sorts first, a code is never silently chosen.

export type AirportCodes = {
  ident: string
  icao: string | null
  iata: string | null
  faa: string | null
}

export type AirportLike = AirportCodes & {
  name: string
  city: string | null
  region: string | null
  country: string
  type?: string | null
  scheduled_service?: boolean | null
}

export type AirportDisplayPreference = 'faa' | 'iata' | 'icao'

export const AIRPORT_DISPLAY_PREFERENCES: AirportDisplayPreference[] = [
  'faa',
  'iata',
  'icao'
]

export const DEFAULT_HOME_AIRPORT = 'KMSO'
export const DEFAULT_AIRPORT_DISPLAY: AirportDisplayPreference = 'faa'

/** Typed text -> comparison form: trimmed, upper case, inner whitespace collapsed. */
export function normalizeAirportQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** The ICAO code if there is one, else the FAA / IATA code, else the OurAirports identifier. */
export function storedCode(a: AirportCodes): string {
  return a.icao ?? a.faa ?? a.iata ?? a.ident
}

/**
 * The code to show on screen. The preferred code first, then the default chain FAA identifier, IATA,
 * ICAO (so a non-US airport with no FAA code shows its IATA code, and one with neither shows its ICAO).
 */
export function displayCode(
  a: AirportCodes,
  preference: AirportDisplayPreference = DEFAULT_AIRPORT_DISPLAY
): string {
  const chain = [a[preference], a.faa, a.iata, a.icao, a.ident]
  return chain.find((c): c is string => !!c) ?? a.ident
}

function codesOf(a: AirportCodes): string[] {
  return [a.icao, a.iata, a.faa, a.ident].filter((c): c is string => !!c)
}

export function isExactCodeMatch(a: AirportCodes, query: string): boolean {
  const q = normalizeAirportQuery(query)
  return q !== '' && codesOf(a).includes(q)
}

const TYPE_RANK: Record<string, number> = {
  large_airport: 0,
  medium_airport: 1,
  small_airport: 2
}

type Scored = { airport: AirportLike; tier: number; sub: number }

function score(a: AirportLike, q: string): Scored | null {
  const lower = q.toLowerCase()
  if (a.icao === q) return { airport: a, tier: 0, sub: 0 }
  if (a.iata === q || a.faa === q || a.ident === q) {
    return { airport: a, tier: 0, sub: 1 }
  }
  if (codesOf(a).some((c) => c.startsWith(q))) {
    return { airport: a, tier: 1, sub: 0 }
  }
  const name = a.name.toLowerCase()
  const city = (a.city ?? '').toLowerCase()
  if (name.startsWith(lower) || city.startsWith(lower)) {
    return { airport: a, tier: 2, sub: 0 }
  }
  if (
    name.split(/\W+/).some((w) => w.startsWith(lower)) ||
    city.split(/\W+/).some((w) => w.startsWith(lower))
  ) {
    return { airport: a, tier: 2, sub: 1 }
  }
  if (name.includes(lower) || city.includes(lower)) {
    return { airport: a, tier: 3, sub: 0 }
  }
  return null
}

/**
 * Candidates that match `query`, best first: exact code (ICAO, then IATA/FAA) beats code prefix beats
 * name/city. Within a tier the home country comes first, then bigger airports and scheduled service, then
 * name. All exact matches are kept (never collapsed to one).
 */
export function rankAirports<T extends AirportLike>(
  candidates: T[],
  query: string,
  options: { homeCountry?: string } = {}
): T[] {
  const q = normalizeAirportQuery(query)
  if (!q) return []
  const home = options.homeCountry?.toUpperCase()
  const scored: Scored[] = []
  for (const c of candidates) {
    const s = score(c, q)
    if (s) scored.push(s)
  }
  const homeRank = (a: AirportLike) => (home && a.country === home ? 0 : 1)
  const typeRank = (a: AirportLike) => TYPE_RANK[a.type ?? ''] ?? 3
  scored.sort(
    (x, y) =>
      x.tier - y.tier ||
      homeRank(x.airport) - homeRank(y.airport) ||
      x.sub - y.sub ||
      typeRank(x.airport) - typeRank(y.airport) ||
      Number(!!y.airport.scheduled_service) -
        Number(!!x.airport.scheduled_service) ||
      x.airport.name.localeCompare(y.airport.name)
  )
  return scored.map((s) => s.airport as T)
}

/** True when the query is a code that exactly matches more than one airport. */
export function isAmbiguous(airports: AirportCodes[], query: string): boolean {
  return airports.filter((a) => isExactCodeMatch(a, query)).length > 1
}

function shortName(name: string): string {
  return name
    .replace(/\bInternational\b/g, 'Intl')
    .replace(/\s+(Airport|Airfield|Airpark)$/i, '')
    .trim()
}

/** "Kalispell MT" for US places (region US-MT), "Guapi CO" elsewhere (country). */
export function airportPlace(a: AirportLike): string {
  const area =
    a.country === 'US' && a.region?.startsWith('US-')
      ? a.region.slice(3)
      : a.country
  return [a.city, area].filter(Boolean).join(' ')
}

/** Option label: "KGPI · FCA · GPI  Glacier Park Intl, Kalispell MT". */
export function formatAirportOption(a: AirportLike): string {
  const codes = [...new Set([a.icao, a.iata, a.faa].filter(Boolean))]
  const head = (codes.length ? codes : [a.ident]).join(' · ')
  return `${head}  ${shortName(a.name)}, ${airportPlace(a)}`
}
