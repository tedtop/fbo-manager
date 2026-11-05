import type { AircraftLookupResult } from '@/lib/aircraft-lookup'
import { findIcaoType, formatIcaoType } from '@/lib/icao-aircraft-types'
import { tailNumberError } from '@/lib/parking-map'

/** A type as stored on an aircraft row: ICAO code plus the display string. */
export interface AircraftTypeChoice {
  icao: string
  display: string
}

export const UNKNOWN_AIRCRAFT_TYPE: AircraftTypeChoice = {
  icao: 'UNKN',
  display: 'Unknown'
}

/**
 * The tail to send to the registry lookup, or null while it is not a complete, usable tail
 * (invalid, or already a known aircraft). Expects an already normalised tail.
 */
export function tailForLookup(
  tail: string,
  knownTailNumbers: ReadonlySet<string>
): string | null {
  if (tailNumberError(tail) !== null) return null
  if (knownTailNumbers.has(tail)) return null
  return tail
}

/** Catalog name when the ICAO code is known, else manufacturer + description, as the flight form does. */
export function choiceFromLookup(
  hit: AircraftLookupResult
): AircraftTypeChoice {
  const catalog = findIcaoType(hit.typeIcao)
  return {
    icao: catalog?.icao ?? hit.typeIcao,
    display: catalog
      ? formatIcaoType(catalog)
      : `${hit.manufacturer ?? ''} ${hit.typeDescription}`.trim()
  }
}

/**
 * The type the form shows: a manual pick always wins; a lookup result only counts when it
 * belongs to the tail currently being looked up (stale results are ignored).
 */
export function effectiveAircraftType(
  picked: AircraftTypeChoice | null,
  lookupTail: string | null,
  hit: AircraftLookupResult | null
): AircraftTypeChoice | null {
  if (picked) return picked
  if (!lookupTail || !hit || hit.tail !== lookupTail) return null
  return choiceFromLookup(hit)
}

/** Number of aircraft per ICAO type code, used to rank the type picker. */
export function countTypeUsage(
  rows: readonly { aircraft_type_icao: string | null }[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const code = row.aircraft_type_icao?.toUpperCase()
    if (code && code !== 'UNKN') counts[code] = (counts[code] ?? 0) + 1
  }
  return counts
}
