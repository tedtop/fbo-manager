import { findAreaAtPoint, polygonBounds, ringOf } from '@/lib/parking-geometry'
import type { AircraftRow } from '@/repositories/aircraft.repo'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'

export type ParkingAreaKind = ParkingAreaRow['kind']

/** Where a plane sits. `heading` is degrees clockwise from true north, nose direction. */
export type PlanePose = { lat: number; lng: number; heading: number }

export type ParkedPlane = PlanePose & {
  tailNumber: string
  typeIcao: string
  typeDisplay: string
}

// Area colours on the map and in the area list. Light blue is reserved for the shape being
// drawn or edited (DRAW_EDIT_COLOR in components/parking/draw-styles.ts).
export const RAMP_COLOR = '#a78bfa'
export const HANGAR_COLOR = '#fb923c'
export const TIE_DOWN_COLOR = '#a3e635'
export const OTHER_COLOR = '#f472b6'

export const KIND_META: Record<
  ParkingAreaKind,
  { label: string; color: string }
> = {
  ramp: { label: 'Ramp', color: RAMP_COLOR },
  hangar: { label: 'Hangar', color: HANGAR_COLOR },
  tie_down: { label: 'Tie-down', color: TIE_DOWN_COLOR },
  other: { label: 'Other', color: OTHER_COLOR }
}

// Solid fills of the area layer. They are close to the kind colours above but darker, so the
// white labels and white plane icons read on them. Opaque on purpose: they hide the aircraft
// that appear in the satellite imagery, so only our own plane markers show inside an area.
export const AREA_FILL_COLORS: Record<ParkingAreaKind, string> = {
  ramp: '#4c3a8a',
  hangar: '#8a4a14',
  tie_down: '#3f6212',
  other: '#9d2a62'
}

/** Fill opacity of an area: solid normally, see-through for the selected one being aligned to the imagery. */
export const AREA_FILL_OPACITY = { solid: 0.97, selected: 0.3 }

export const AREA_KINDS = Object.keys(KIND_META) as ParkingAreaKind[]

// ---------------------------------------------------------------------------
// Heading and movement maths
// ---------------------------------------------------------------------------

const METERS_PER_DEGREE_LAT = 111_320
const FEET_PER_METER = 3.28084

/** Degrees folded into [0, 360). */
export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Coordinates are stored with 6 decimals (numeric(9, 6), about 0.1 m). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** What is stored: a whole degree in 0..359 (the column is a smallint with that check). */
export function toStoredHeading(degrees: number): number {
  return Math.round(normalizeHeading(degrees)) % 360
}

/** True when the plane's current heading differs from the one it had when it was selected. */
export function canRevertHeading(original: number, current: number): boolean {
  return toStoredHeading(original) !== toStoredHeading(current)
}

/**
 * True heading that makes the nose point in a screen direction (0 = up, 90 = right,
 * 180 = down, 270 = left) given the current map bearing.
 */
export function headingForScreenDirection(
  screenDegrees: number,
  mapBearing: number
): number {
  return toStoredHeading(screenDegrees + mapBearing)
}

/** Move `feet` along a true heading (negative = backwards). */
export function moveAlongHeading(
  pose: PlanePose,
  heading: number,
  feet: number
): PlanePose {
  const rad = (heading * Math.PI) / 180
  const feetPerDegreeLat = METERS_PER_DEGREE_LAT * FEET_PER_METER
  const feetPerDegreeLng =
    feetPerDegreeLat * Math.cos((pose.lat * Math.PI) / 180)
  return {
    lat: pose.lat + (Math.cos(rad) * feet) / feetPerDegreeLat,
    lng: pose.lng + (Math.sin(rad) * feet) / feetPerDegreeLng,
    heading: pose.heading
  }
}

export type MoveKeys = {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
}

export const MOVE_FEET_PER_SECOND = 60
export const ROTATE_DEGREES_PER_SECOND = 120
const MAX_STEP_SECONDS = 0.1

/** One animation frame of arrow-key control: left/right rotate, up/down move along the nose. */
export function stepPose(
  pose: PlanePose,
  keys: MoveKeys,
  dtSeconds: number
): PlanePose {
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_SECONDS)
  const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const heading = normalizeHeading(
    pose.heading + turn * ROTATE_DEGREES_PER_SECOND * dt
  )
  const forward = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)
  if (forward === 0) return { ...pose, heading }
  const moved = moveAlongHeading(
    pose,
    heading,
    forward * MOVE_FEET_PER_SECOND * dt
  )
  return { ...moved, heading }
}

export function samePose(a: PlanePose, b: PlanePose): boolean {
  return (
    Math.abs(a.lat - b.lat) < 1e-7 &&
    Math.abs(a.lng - b.lng) < 1e-7 &&
    toStoredHeading(a.heading) === toStoredHeading(b.heading)
  )
}

// ---------------------------------------------------------------------------
// Aircraft rows, membership, tail numbers
// ---------------------------------------------------------------------------

/** Parked plane from an aircraft row, or null when it has no position. */
export function toParkedPlane(row: AircraftRow): ParkedPlane | null {
  if (row.parked_lat == null || row.parked_lng == null) return null
  // PostgREST returns numeric columns as numbers although the generated type says string.
  const lat = Number(row.parked_lat)
  const lng = Number(row.parked_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    tailNumber: row.tail_number,
    typeIcao: row.aircraft_type_icao,
    typeDisplay: row.aircraft_type_display,
    lat,
    lng,
    heading: normalizeHeading(row.parked_heading ?? 0)
  }
}

/** The area a plane is physically inside (smallest wins), from live geometry. */
export function areaOfPlane(
  plane: PlanePose,
  areas: readonly ParkingAreaRow[]
): ParkingAreaRow | null {
  return findAreaAtPoint([plane.lng, plane.lat], areas)
}

/** Number of planes inside each area, keyed by area id. Planes outside every area are not counted. */
export function countAircraftByArea(
  areas: readonly ParkingAreaRow[],
  planes: readonly PlanePose[]
): Map<number, number> {
  const counts = new Map<number, number>()
  for (const plane of planes) {
    const area = areaOfPlane(plane, areas)
    if (area) counts.set(area.id, (counts.get(area.id) ?? 0) + 1)
  }
  return counts
}

export function normalizeTailNumber(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Error message for an unusable tail number, or null when it is fine. */
export function tailNumberError(tailNumber: string): string | null {
  if (!tailNumber) return 'Enter a tail number.'
  if (!/^[A-Z0-9-]{2,10}$/.test(tailNumber)) {
    return 'Use 2-10 letters, digits or dashes.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Map data
// ---------------------------------------------------------------------------

export type AreaFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Polygon'; coordinates: number[][][] }
    properties: {
      id: number
      code: string
      kind: ParkingAreaKind
      color: string
      fillColor: string
      selected: boolean
    }
  }>
}

function boundsSize(ring: number[][]): number {
  const [minX, minY, maxX, maxY] = polygonBounds(ring)
  return (maxX - minX) * (maxY - minY)
}

/**
 * GeoJSON for the area layers. Areas without a drawable polygon are skipped, as is
 * `hiddenId` (the area whose shape Draw is currently editing). Larger areas come first, so
 * with opaque fills an area nested inside another is drawn on top of it and stays visible.
 */
export function areaFeatureCollection(
  areas: readonly ParkingAreaRow[],
  selectedId: number | null,
  hiddenId: number | null = null
): AreaFeatureCollection {
  const sized: Array<{
    feature: AreaFeatureCollection['features'][number]
    size: number
  }> = []
  for (const area of areas) {
    if (area.id === hiddenId) continue
    const ring = ringOf(area.polygon)
    if (!ring || ring.length < 4) continue
    const feature: AreaFeatureCollection['features'][number] = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        id: area.id,
        code: area.code,
        kind: area.kind,
        color: KIND_META[area.kind].color,
        fillColor: AREA_FILL_COLORS[area.kind],
        selected: area.id === selectedId
      }
    }
    sized.push({ feature, size: boundsSize(ring) })
  }
  sized.sort((a, b) => b.size - a.size)
  return { type: 'FeatureCollection', features: sized.map((s) => s.feature) }
}
