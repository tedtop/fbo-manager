// Wing loading: how a requested fuel uplift splits across the left wing, right wing and (where the type
// has one) center tank. Airline practice, as on United's routine fuel service form: the wings are
// filled evenly to their maximum and only what is left goes in the center tank.

export interface TankCapacity {
  /** Max fuel per wing tank, lbs (summer). */
  wingLbs: number
  /** Winter max per wing tank where it differs (MAI ramp placard, May 2025: B737 8,800 winter, kept as the airline's figure). */
  wingWinterLbs?: number
  /** Center tank max, lbs; 0 = no center tank; undefined = unknown (no overflow check). */
  centerLbs?: number
  /** Wing and center maxima confirmed against the manufacturer's published per-tank figures (see `source`). */
  verified: boolean
}

export interface AircraftFuelType extends TankCapacity {
  key: string
  label: string
  /** Matches the type string QT or a dispatcher gives, upper-cased and stripped of spaces/dashes. */
  match: RegExp
  /** Where the capacities come from (document, revision, page). */
  source?: string
  /** Why the type is still unverified, shown to the fueler and listed in the docs. */
  unverifiedNote?: string
}

// Capacity sources (B88, 2026-11-11). Per-tank gallons come from the manufacturers' free airport documents and
// are converted to lbs at the density each document states, so the table can be re-checked against the page cited.
//  - Boeing 737-600/-700/-800/-900/ER: "Airplane Rescue and Fire Fighting Information", 737 section, page
//    737.1.6, 30 Apr 2024 (boeing.com/content/dam/boeing/v2/airports/arff/arff737.pdf): tank No. 1 and No. 2
//    1,288 US gal each, center 4,299 US gal = 6,875 US gal, which matches the usable total in "Next-Generation 737
//    Airplane Characteristics for Airport Planning" D6-58325-7 Rev C (Oct 2025), pages 2-1 to 2-6 (6,875 gal,
//    46,062 lb = 6.7 lb/gal). Optional aux tanks (-900ER 520 / 962 gal, BBJ) are not modelled.
//  - Boeing 737 MAX-7/-8/-9/-10: "737 MAX Airplane Characteristics for Airport Planning" D6-38A004 Rev K (Jul 2025),
//    pages 2-1 to 2-4, gives only the total usable fuel, 6,820 US gal at 6.7 lb/gal = 45,694 lb, no per-tank split.
//    Wings: 8,650 lb each from the airlines' fuel slips (Ted, 2026-11-11). Boeing's ARFF 737 page 737.1.1 prints the
//    NG tanks (1,288 gal = 8,630 lb at 6.7), 20 lb lower; the airline figure is kept. Center: DERIVED = 45,694 lb
//    total - 2 x 8,650 lb = 28,394 lb (6.7 lb/gal); not a published per-tank figure. ARFF's 4,299 gal center plus
//    both wings would be 6,875 gal, 55 gal above the planning document's usable total.
//  - Airbus A319/A320: "Aircraft Characteristics - Airport and Maintenance Planning" A319 and A320, Rev Jul 01/26,
//    section 2-1-1 (page 5), density 0.785 kg/l (6.552 lb/US gal): total wing fuel 15,959 l (CFM ceo) / 15,609 l
//    (IAE ceo) / 15,490 l (neo) = 4,216 / 4,123 / 4,092 US gal across both wings; center tank 8,250 l = 2,179 US gal
//    in every variant. Per wing is half the wing total. The table uses the smallest (neo, 2,046 gal per wing) so a
//    plan never overfills; the airline's own wing figure can be typed over it on the sheet.
const BOEING_LB_PER_GAL = 6.7
const AIRBUS_LB_PER_GAL = 0.785 * 2.20462 * 3.78541 // 0.785 kg/l

const lbs = (gallons: number, lbPerGal: number) => Math.round(gallons * lbPerGal)

export const AIRCRAFT_FUEL_TYPES: AircraftFuelType[] = [
  {
    key: 'b737max',
    label: 'B737 MAX',
    match: /^(B?7?3[789]M|737MAX|B?7M[789]|B3[789]M|B3XM|B3[789]MAX)/,
    wingLbs: 8650,
    wingWinterLbs: 8800,
    centerLbs: lbs(6820, BOEING_LB_PER_GAL) - 2 * 8650,
    verified: true,
    source:
      'wings: airline fuel slips (Ted, 2026-11-11); center: derived from Boeing D6-38A004 Rev K (Jul 2025) usable 6,820 gal at 6.7 lb/gal minus both wings'
  },
  {
    key: 'b737ng',
    label: 'B737-700/800/900',
    match: /^(B?73[6789]|737)/,
    wingLbs: lbs(1288, BOEING_LB_PER_GAL),
    wingWinterLbs: 8800,
    centerLbs: lbs(4299, BOEING_LB_PER_GAL),
    verified: true,
    source: 'Boeing ARFF 737, p. 737.1.6 (30 Apr 2024); Boeing D6-58325-7 Rev C (Oct 2025)'
  },
  {
    key: 'a320',
    label: 'A319/A320',
    match: /^(A?3(19|20)|A32[01])/,
    wingLbs: lbs(2046, AIRBUS_LB_PER_GAL),
    centerLbs: lbs(2179, AIRBUS_LB_PER_GAL),
    verified: true,
    source: 'Airbus AC A319 / A320 Airport and Maintenance Planning, Rev Jul 01/26, 2-1-1'
  },
  { key: 'e175', label: 'E175', match: /^(E?175|E75)/, wingLbs: 10390, centerLbs: 0, verified: true },
  { key: 'crj200', label: 'CRJ200', match: /^(CRJ2|CL?60|CRJ200)/, wingLbs: 4488, centerLbs: 4930, verified: true },
  { key: 'crj700', label: 'CRJ700/900', match: /^(CRJ[79]|CRJ700|CRJ900)/, wingLbs: 7492, centerLbs: 4610, verified: true }
]

export const DEFAULT_DENSITY = 6.79

const normalise = (type: string) => type.toUpperCase().replace(/[\s\-_/]/g, '')

/** The fuel-type row for an aircraft type string, or undefined when it is not an airline type we know. */
export function findFuelType(type: string | undefined): AircraftFuelType | undefined {
  if (!type) return undefined
  const t = normalise(type)
  return AIRCRAFT_FUEL_TYPES.find((entry) => entry.match.test(t))
}

export interface TankLbs {
  left: number
  center: number
  right: number
}

export interface WingLoadInput {
  capacity: TankCapacity
  /** Fuel already in each tank, lbs (zeros when unknown). */
  before?: Partial<TankLbs>
  /** Planned gate fuel: the total each aircraft should hold after fueling, lbs (the QT request / "Req" on the ticket). */
  plannedLbs: number
  winter?: boolean
  /** Replaces the table's wing max (the airline's own figure on the sheet). */
  wingMaxLbs?: number
  density?: number
}

export interface WingLoadResult {
  before: TankLbs
  /** What each tank ends up holding. */
  after: TankLbs
  /** What goes into each tank (after minus before). */
  add: TankLbs
  addGallons: TankLbs
  beforeTotalLbs: number
  plannedLbs: number
  density: number
  totalAddLbs: number
  totalAddGallons: number
  totalAfterLbs: number
  hasCenter: boolean
  warnings: string[]
}

const round = (n: number) => Math.round(n)

export function planWingLoad(input: WingLoadInput): WingLoadResult {
  const density = input.density && input.density > 0 ? input.density : DEFAULT_DENSITY
  const { capacity } = input
  const before: TankLbs = {
    left: input.before?.left ?? 0,
    center: input.before?.center ?? 0,
    right: input.before?.right ?? 0
  }
  const wingMax =
    input.wingMaxLbs ?? (input.winter && capacity.wingWinterLbs ? capacity.wingWinterLbs : capacity.wingLbs)
  const hasCenter = capacity.centerLbs !== 0
  const warnings: string[] = []

  const beforeTotal = before.left + before.center + before.right
  const totalAfter = Math.max(input.plannedLbs, beforeTotal)

  // Wings take everything up to their max, evenly; the center tank only gets the rest.
  let center = hasCenter ? Math.max(before.center, totalAfter - 2 * wingMax) : 0
  let wing = (totalAfter - center) / 2
  if (wing > wingMax) {
    // No center tank (or none left to take it): the request does not fit.
    warnings.push(`Planned fuel is ${round(2 * (wing - wingMax))} lbs more than the wings can hold`)
    wing = wingMax
  }
  if (hasCenter && capacity.centerLbs !== undefined && center > capacity.centerLbs) {
    warnings.push(`Center tank over its ${capacity.centerLbs.toLocaleString()} lb max by ${round(center - capacity.centerLbs)} lbs`)
    center = capacity.centerLbs
  }

  const after: TankLbs = { left: wing, center, right: wing }
  const add: TankLbs = {
    left: after.left - before.left,
    center: after.center - before.center,
    right: after.right - before.right
  }
  if (add.left < 0 || add.right < 0 || add.center < 0) {
    warnings.push('A tank already holds more than it should end up with: balance or defuel needed')
  }

  const gal = (lbs: number) => lbs / density
  const totalAdd = add.left + add.center + add.right
  return {
    before,
    after,
    add,
    addGallons: { left: gal(add.left), center: gal(add.center), right: gal(add.right) },
    beforeTotalLbs: beforeTotal,
    plannedLbs: totalAfter,
    density,
    totalAddLbs: totalAdd,
    totalAddGallons: gal(totalAdd),
    totalAfterLbs: after.left + after.center + after.right,
    hasCenter,
    warnings
  }
}

export const SHEET_TOLERANCE_GAL = 75

/** The truck-meter check at the bottom of the United sheet: calculated gallons minus gallons actually added. */
export function truckCheck(calculatedGallons: number, truckGallons: number, tolerance = SHEET_TOLERANCE_GAL) {
  const difference = Math.round(calculatedGallons) - Math.round(truckGallons)
  return { difference, withinTolerance: Math.abs(difference) <= tolerance, tolerance }
}
