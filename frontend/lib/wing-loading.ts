// Wing loading: how a requested fuel uplift splits across the left wing, right wing and (where the type
// has one) center tank. Airline practice, as on United's routine fuel service form: the wings are
// filled evenly to their maximum and only what is left goes in the center tank.

export interface TankCapacity {
  /** Max fuel per wing tank, lbs (summer). */
  wingLbs: number
  /** Winter max per wing tank where it differs (placard: B737 8,600 summer / 8,800 winter). */
  wingWinterLbs?: number
  /** Center tank max, lbs; 0 = no center tank; undefined = unknown (no overflow check). */
  centerLbs?: number
  /** Wing and center maxima confirmed from the ramp placard or a real fuel sheet. */
  verified: boolean
}

export interface AircraftFuelType extends TankCapacity {
  key: string
  label: string
  /** Matches the type string QT or a dispatcher gives, upper-cased and stripped of spaces/dashes. */
  match: RegExp
}

// Wing numbers are the MAI ramp placard (May 2025). Center tanks are published figures at 6.7 lbs/gal
// except where marked verified: confirm each against a real fuel sheet and correct it here.
export const AIRCRAFT_FUEL_TYPES: AircraftFuelType[] = [
  { key: 'b737max9', label: 'B737 MAX 9', match: /^(B?7?39M|737MAX9|B?7M9|B39M|7379M)/, wingLbs: 8600, wingWinterLbs: 8800, centerLbs: 28800, verified: false },
  { key: 'b737ng', label: 'B737-800/900', match: /^(B?73[789]|737)/, wingLbs: 8600, wingWinterLbs: 8800, centerLbs: 28800, verified: false },
  { key: 'a320', label: 'A319/A320', match: /^(A?3(19|20)|A32[01])/, wingLbs: 14000, verified: false },
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
