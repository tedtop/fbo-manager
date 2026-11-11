import { findIcaoType } from '@/lib/icao-aircraft-types'

/**
 * Real aircraft dimensions by ICAO type designator, used to draw every parked plane on the
 * /parking map at true scale (metres, not pixels).
 *
 * Sources: manufacturer specification sheets, FAA type certificate data sheets and the
 * Wikipedia specification tables of each type (spot-checked on the web: G500, G600, Phenom
 * 300; the rest are rounded from the same published figures). Values are APPROXIMATE, rounded
 * to 0.1 m, and describe a typical variant of the designator (e.g. one 737-800 figure for
 * all winglet-equipped 737NG). Good enough to compare footprints on a ramp, not for
 * clearance calculations.
 *
 * Conventions: wingspan is the main wing tip to tip (helicopters: main rotor diameter);
 * length is nose to tail (helicopters: overall length with the rotors turning, so the rotor
 * disc fits inside the wingspan x length box).
 */

/** Which outline (lib/aircraft-silhouettes.ts) draws the type. */
export type SilhouetteCategory =
  | 'single-high'
  | 'single-low'
  | 'twin-piston'
  | 'turboprop'
  | 'light-jet'
  | 'mid-jet'
  | 'airliner'
  | 'helicopter'

export const SILHOUETTE_CATEGORIES: readonly SilhouetteCategory[] = [
  'single-high',
  'single-low',
  'twin-piston',
  'turboprop',
  'light-jet',
  'mid-jet',
  'airliner',
  'helicopter'
]

export type AircraftDimensions = {
  wingspanM: number
  lengthM: number
  category: SilhouetteCategory
  /** True when the type is not in the table, so the size is a nominal one for its category. */
  estimated: boolean
}

// [icao, wingspan m, length m, silhouette]
type Row = [string, number, number, SilhouetteCategory]

const ROWS: Row[] = [
  // Single piston / single turboprop, high wing
  ['C150', 10.1, 7.2, 'single-high'],
  ['C152', 10.2, 7.3, 'single-high'],
  ['C170', 10.9, 7.6, 'single-high'],
  ['C172', 11.0, 8.3, 'single-high'],
  ['C177', 10.8, 8.2, 'single-high'],
  ['C182', 11.0, 8.8, 'single-high'],
  ['C185', 10.9, 7.9, 'single-high'],
  ['C206', 11.2, 8.6, 'single-high'],
  ['T206', 11.2, 8.6, 'single-high'],
  ['C210', 11.2, 8.6, 'single-high'],
  ['C82R', 11.0, 8.8, 'single-high'], // R182 Skylane RG
  ['C82S', 11.0, 8.8, 'single-high'], // T182 Turbo Skylane
  ['C82T', 11.0, 8.8, 'single-high'], // TR182 Turbo Skylane RG
  ['PA12', 10.8, 6.9, 'single-high'],
  ['PA18', 10.7, 6.9, 'single-high'],
  ['S108', 10.4, 7.4, 'single-high'],
  ['HUSK', 10.8, 6.9, 'single-high'],
  ['CH7B', 10.2, 6.9, 'single-high'],
  ['C208', 15.9, 11.5, 'single-high'], // Caravan
  ['KODI', 13.7, 10.4, 'single-high'], // Kodiak 100

  // Single piston / single turboprop, low wing
  ['PA28', 10.7, 7.2, 'single-low'],
  ['P28A', 10.8, 7.3, 'single-low'],
  ['P28R', 10.8, 7.5, 'single-low'],
  ['PA24', 10.9, 7.6, 'single-low'],
  ['PA32', 11.0, 8.4, 'single-low'],
  ['PA46', 13.1, 8.7, 'single-low'],
  ['P46T', 13.1, 9.0, 'single-low'], // Meridian / M500
  ['SR20', 10.8, 7.9, 'single-low'],
  ['SR22', 11.7, 7.9, 'single-low'],
  ['S22T', 11.7, 7.9, 'single-low'],
  ['DA20', 10.9, 7.2, 'single-low'],
  ['DA40', 11.9, 8.1, 'single-low'],
  ['M20P', 11.1, 7.7, 'single-low'],
  ['BE33', 10.0, 7.7, 'single-low'],
  ['BE35', 10.2, 8.0, 'single-low'],
  ['BE36', 11.5, 8.4, 'single-low'],
  ['AA5', 9.6, 6.7, 'single-low'],
  ['PC12', 16.3, 14.4, 'single-low'],
  ['TBM7', 12.8, 10.6, 'single-low'],
  ['TBM8', 12.8, 10.6, 'single-low'],
  ['TBM9', 12.9, 10.7, 'single-low'],

  // Piston twins
  ['BE55', 11.5, 8.2, 'twin-piston'],
  ['BE58', 11.5, 9.1, 'twin-piston'],
  ['BE60', 12.0, 10.3, 'twin-piston'],
  ['C310', 11.3, 9.7, 'twin-piston'],
  ['C340', 11.6, 10.5, 'twin-piston'],
  ['C402', 13.4, 11.1, 'twin-piston'],
  ['C414', 13.4, 11.1, 'twin-piston'],
  ['C421', 12.5, 11.0, 'twin-piston'],
  ['PA31', 12.4, 9.9, 'twin-piston'],
  ['PA34', 11.9, 8.7, 'twin-piston'],
  ['PA44', 11.7, 8.4, 'twin-piston'],
  ['DA42', 13.4, 8.6, 'twin-piston'],
  ['DC3', 29.0, 19.7, 'twin-piston'],

  // Twin (and four-engine) turboprops
  ['BE10', 14.0, 12.2, 'turboprop'],
  ['BE20', 16.6, 13.3, 'turboprop'],
  ['BE30', 16.6, 13.3, 'turboprop'],
  ['B350', 17.7, 14.2, 'turboprop'],
  ['BE9L', 15.3, 10.8, 'turboprop'],
  ['BE99', 14.0, 13.6, 'turboprop'],
  ['B190', 17.7, 17.6, 'turboprop'],
  ['C425', 13.4, 10.9, 'turboprop'],
  ['C441', 15.0, 11.9, 'turboprop'],
  ['MU2', 12.0, 12.0, 'turboprop'],
  ['P180', 14.0, 14.4, 'turboprop'],
  ['SW4', 17.4, 18.1, 'turboprop'],
  ['SF34', 21.4, 19.7, 'turboprop'],
  ['E120', 19.8, 20.0, 'turboprop'],
  ['DHC6', 19.8, 15.8, 'turboprop'],
  ['AT72', 27.1, 27.2, 'turboprop'],
  ['DH8D', 28.4, 32.8, 'turboprop'],
  ['C130', 40.4, 29.8, 'turboprop'],

  // Light jets
  ['SF50', 11.8, 9.4, 'light-jet'],
  ['EA50', 11.5, 10.2, 'light-jet'],
  ['E50P', 12.3, 12.8, 'light-jet'],
  ['HDJT', 12.1, 13.0, 'light-jet'],
  ['C510', 13.2, 12.4, 'light-jet'],
  ['PRM1', 13.6, 14.0, 'light-jet'],
  ['C525', 14.3, 13.0, 'light-jet'],
  ['C500', 14.3, 13.3, 'light-jet'],
  ['C501', 14.3, 13.3, 'light-jet'],
  ['C25A', 15.3, 14.4, 'light-jet'],
  ['C25B', 16.3, 15.6, 'light-jet'],
  ['C25C', 15.5, 16.3, 'light-jet'],
  ['C550', 15.8, 14.4, 'light-jet'],
  ['C560', 15.9, 14.9, 'light-jet'],
  ['E55P', 15.9, 15.6, 'light-jet'],
  ['PC24', 17.0, 16.8, 'light-jet'],
  ['LJ31', 13.4, 14.8, 'light-jet'],
  ['LJ35', 12.0, 14.8, 'light-jet'],
  ['LJ40', 14.6, 16.9, 'light-jet'],
  ['LJ45', 14.6, 17.6, 'light-jet'],
  ['BE40', 13.3, 14.8, 'light-jet'],
  ['FA10', 13.1, 13.9, 'light-jet'],
  ['WW24', 13.7, 15.9, 'light-jet'],

  // Mid-size / large business jets, regional jets and rear-engined transports (swept wing, T-tail)
  ['C56X', 17.2, 16.0, 'mid-jet'],
  ['C650', 16.3, 16.9, 'mid-jet'],
  ['C680', 19.3, 19.4, 'mid-jet'],
  ['C68A', 22.0, 19.0, 'mid-jet'],
  ['C700', 22.0, 22.2, 'mid-jet'],
  ['C750', 19.4, 22.0, 'mid-jet'],
  ['LJ55', 13.4, 16.8, 'mid-jet'],
  ['LJ60', 13.4, 17.9, 'mid-jet'],
  ['LJ75', 15.3, 17.7, 'mid-jet'],
  ['E545', 20.2, 19.7, 'mid-jet'], // Legacy 450
  ['E550', 20.2, 20.7, 'mid-jet'], // Legacy 500
  ['H25B', 15.7, 15.6, 'mid-jet'],
  ['H25C', 15.7, 16.4, 'mid-jet'],
  ['HA4T', 18.8, 21.1, 'mid-jet'],
  ['ASTR', 16.1, 16.9, 'mid-jet'],
  ['G150', 16.9, 17.3, 'mid-jet'],
  ['GALX', 17.7, 19.0, 'mid-jet'],
  ['G280', 19.2, 20.3, 'mid-jet'],
  ['FA20', 16.3, 17.2, 'mid-jet'],
  ['FA50', 18.9, 18.5, 'mid-jet'],
  ['F900', 19.3, 20.2, 'mid-jet'],
  ['F2TH', 19.3, 20.2, 'mid-jet'],
  ['FA7X', 26.2, 23.4, 'mid-jet'],
  ['FA8X', 26.3, 24.5, 'mid-jet'],
  ['CL30', 19.5, 20.9, 'mid-jet'],
  ['CL35', 21.0, 20.9, 'mid-jet'],
  ['CL60', 19.6, 20.9, 'mid-jet'],
  ['GLEX', 28.7, 30.3, 'mid-jet'],
  ['GL5T', 28.7, 29.5, 'mid-jet'],
  ['GL6T', 28.7, 30.3, 'mid-jet'],
  ['GL7T', 31.7, 33.9, 'mid-jet'],
  ['GLF2', 20.9, 24.4, 'mid-jet'],
  ['GLF3', 23.7, 25.3, 'mid-jet'],
  ['GLF4', 23.7, 26.9, 'mid-jet'],
  ['GLF5', 28.5, 29.4, 'mid-jet'],
  ['GLF6', 30.4, 30.4, 'mid-jet'],
  ['GA5C', 26.3, 27.8, 'mid-jet'],
  ['GA6C', 28.7, 29.3, 'mid-jet'],
  ['GA7C', 31.4, 33.4, 'mid-jet'],
  ['CRJ2', 21.2, 26.8, 'mid-jet'],
  ['CRJ7', 23.2, 32.5, 'mid-jet'],
  ['CRJ9', 24.9, 36.2, 'mid-jet'],
  ['E135', 20.0, 26.3, 'mid-jet'],
  ['E145', 20.0, 29.9, 'mid-jet'],
  ['MD82', 32.9, 45.1, 'mid-jet'],
  ['MD88', 32.9, 45.1, 'mid-jet'],

  // Airliners (wing-mounted engines)
  ['E170', 26.0, 29.9, 'airliner'],
  ['E175', 26.0, 31.7, 'airliner'],
  ['E190', 28.7, 36.2, 'airliner'],
  ['E195', 28.7, 38.7, 'airliner'],
  ['A318', 34.1, 31.4, 'airliner'],
  ['A319', 34.1, 33.8, 'airliner'],
  ['A320', 34.1, 37.6, 'airliner'],
  ['A321', 34.1, 44.5, 'airliner'],
  ['A20N', 35.8, 37.6, 'airliner'],
  ['A21N', 35.8, 44.5, 'airliner'],
  ['A332', 60.3, 58.8, 'airliner'],
  ['A333', 60.3, 63.7, 'airliner'],
  ['A359', 64.8, 66.8, 'airliner'],
  ['A388', 79.8, 72.7, 'airliner'],
  ['B733', 28.9, 33.4, 'airliner'],
  ['B734', 28.9, 36.4, 'airliner'],
  ['B737', 35.8, 33.6, 'airliner'],
  ['B738', 35.8, 39.5, 'airliner'],
  ['B739', 35.8, 42.1, 'airliner'],
  ['B38M', 35.9, 39.5, 'airliner'],
  ['B39M', 35.9, 42.2, 'airliner'],
  ['B744', 64.4, 70.7, 'airliner'],
  ['B748', 68.4, 76.3, 'airliner'],
  ['B752', 38.0, 47.3, 'airliner'],
  ['B753', 38.0, 54.4, 'airliner'],
  ['B762', 47.6, 48.5, 'airliner'],
  ['B763', 47.6, 54.9, 'airliner'],
  ['B772', 60.9, 63.7, 'airliner'],
  ['B77W', 64.8, 73.9, 'airliner'],
  ['B788', 60.1, 56.7, 'airliner'],
  ['B789', 60.1, 62.8, 'airliner'],
  ['MD11', 51.7, 61.6, 'airliner'],

  // Helicopters: main rotor diameter x overall length, rotors turning
  ['R22', 7.7, 8.8, 'helicopter'],
  ['R44', 10.1, 11.7, 'helicopter'],
  ['R66', 10.1, 11.7, 'helicopter'],
  ['H500', 8.1, 9.4, 'helicopter'],
  ['B06', 10.2, 11.9, 'helicopter'],
  ['B407', 10.7, 12.7, 'helicopter'],
  ['B429', 10.9, 12.9, 'helicopter'],
  ['B412', 14.0, 17.1, 'helicopter'],
  ['B212', 14.6, 17.4, 'helicopter'],
  ['AS50', 10.7, 12.9, 'helicopter'],
  ['EC30', 10.7, 12.8, 'helicopter'],
  ['EC35', 10.2, 12.2, 'helicopter'],
  ['EC45', 11.0, 13.0, 'helicopter'],
  ['A109', 11.0, 13.0, 'helicopter'],
  ['A139', 13.8, 16.7, 'helicopter'],
  ['S76', 13.4, 16.0, 'helicopter'],
  ['S92', 17.2, 20.9, 'helicopter']
]

export const AIRCRAFT_DIMENSIONS: Readonly<
  Record<
    string,
    { wingspanM: number; lengthM: number; category: SilhouetteCategory }
  >
> = Object.fromEntries(
  ROWS.map(([icao, wingspanM, lengthM, category]) => [
    icao,
    { wingspanM, lengthM, category }
  ])
)

/** Nominal footprint per category, for types the table does not know. */
export const CATEGORY_NOMINAL_M: Readonly<
  Record<SilhouetteCategory, { wingspanM: number; lengthM: number }>
> = {
  'single-high': { wingspanM: 11.0, lengthM: 8.4 },
  'single-low': { wingspanM: 10.8, lengthM: 7.9 },
  'twin-piston': { wingspanM: 11.8, lengthM: 9.0 },
  turboprop: { wingspanM: 16.0, lengthM: 13.0 },
  'light-jet': { wingspanM: 14.5, lengthM: 14.0 },
  'mid-jet': { wingspanM: 20.0, lengthM: 20.5 },
  airliner: { wingspanM: 34.0, lengthM: 38.0 },
  helicopter: { wingspanM: 10.5, lengthM: 12.5 }
}

export const DEFAULT_CATEGORY: SilhouetteCategory = 'single-low'

// Ids once stored by the older size picker (lib/aircraft-types.ts) instead of an ICAO code.
const LEGACY_TYPE_IDS: Record<string, SilhouetteCategory> = {
  light_single: 'single-low',
  light_twin: 'twin-piston',
  turboprop: 'turboprop',
  light_jet: 'light-jet',
  mid_size_jet: 'mid-jet',
  regional_jet: 'mid-jet',
  narrow_body: 'airliner',
  ultra_long_range: 'mid-jet'
}

/** Category of a type missing from the table, inferred from the ICAO class code and wake category. */
export function inferCategory(typeIcao: string): SilhouetteCategory | null {
  const type = findIcaoType(typeIcao)
  if (!type?.classCode) return null
  const [kind, , engine] = type.classCode
  if (kind === 'H') return 'helicopter'
  if (engine === 'T') return 'turboprop'
  if (engine === 'J') {
    if (
      type.engineCount === 4 ||
      type.wakeCategory === 'H' ||
      type.wakeCategory === 'J'
    )
      return 'airliner'
    return type.wakeCategory === 'L' ? 'light-jet' : 'mid-jet'
  }
  if (type.engineCount && type.engineCount > 1) return 'twin-piston'
  return 'single-low'
}

/**
 * True-size footprint for a stored type code. Unknown, blank or "UNKN" types get the nominal
 * size of their inferred category (or `fallbackCategory`, then a light single) with
 * `estimated: true`, so callers can draw them a little muted.
 */
export function dimensionsFor(
  typeIcao: string | null | undefined,
  fallbackCategory?: SilhouetteCategory
): AircraftDimensions {
  const code = (typeIcao ?? '').trim()
  const known = AIRCRAFT_DIMENSIONS[code.toUpperCase()]
  if (known) return { ...known, estimated: false }
  const category =
    inferCategory(code) ??
    LEGACY_TYPE_IDS[code.toLowerCase()] ??
    fallbackCategory ??
    DEFAULT_CATEGORY
  return { ...CATEGORY_NOMINAL_M[category], category, estimated: true }
}
