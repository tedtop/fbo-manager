// Printed origin / destination -> stored airport code (BACKLOG B45, docs/PLAN.md "B45 Schedule sheet import design").
// Same rules as the flight form's airport picker (lib/airports): a typed IATA / FAA / ICAO code matches every airport
// that carries it; exactly one match is taken, several (GPI is Glacier Park and Guapi) or none is left to the user.
// The stored value is storedCode(): the ICAO code (KSEA), as the form stores it. Pure.

import {
  type AirportLike,
  isAmbiguous,
  isExactCodeMatch,
  normalizeAirportQuery,
  rankAirports,
  storedCode
} from '@/lib/airports'

export type AirportResolution<A extends AirportLike = AirportLike> =
  | { state: 'blank' }
  | { state: 'resolved'; code: string; airport: A }
  /** The printed code matches several airports: `candidates` are ranked, home country first. */
  | { state: 'ambiguous'; candidates: A[] }
  /** No airport carries this code (a place name, a typo, a strip not in the table). */
  | { state: 'unmatched' }

export function resolveAirportText<A extends AirportLike>(
  printed: string,
  airports: readonly A[],
  { homeCountry }: { homeCountry?: string } = {}
): AirportResolution<A> {
  const q = normalizeAirportQuery(printed)
  if (!q) return { state: 'blank' }
  const exact = airports.filter((a) => isExactCodeMatch(a, q))
  if (exact.length === 0) return { state: 'unmatched' }
  if (isAmbiguous(exact, q)) return { state: 'ambiguous', candidates: rankAirports(exact, q, { homeCountry }) }
  return { state: 'resolved', code: storedCode(exact[0]), airport: exact[0] }
}

/** The text to look up in the airport table: only code-shaped text (3 to 4 letters/digits) is worth a query. */
export function airportCodeToLookUp(printed: string): string | null {
  const q = normalizeAirportQuery(printed)
  return /^[A-Z0-9]{3,4}$/.test(q) ? q : null
}

export interface AirportChoice {
  /** The stored code to write ('' = none), or null when nothing is resolved yet. */
  code: string | null
  resolution: AirportResolution
  /** The user picked it in the combobox (or cleared it). */
  fromUser: boolean
}

/**
 * User choice > auto-resolved printed code > nothing. A user choice may be '' (cleared on purpose). Blank printed text
 * stays blank without asking anything.
 */
export function resolveAirportChoice(
  printed: string,
  override: string | null,
  airports: readonly AirportLike[],
  opts: { homeCountry?: string } = {}
): AirportChoice {
  const resolution = resolveAirportText(printed, airports, opts)
  if (override !== null) return { code: override.trim(), resolution, fromUser: true }
  return { code: resolution.state === 'resolved' ? resolution.code : resolution.state === 'blank' ? '' : null, resolution, fromUser: false }
}
