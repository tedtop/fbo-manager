import { pointInPolygon } from '@/lib/point-in-polygon'

export type LngLat = [number, number]
export type Ring = number[][]
export type GeoJsonPolygon = { type: 'Polygon'; coordinates: number[][][] }

function isPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function isPositionArray(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length > 0 && value.every(isPosition)
}

/**
 * Outer ring of a polygon. Accepts a GeoJSON Polygon object or a bare ring array
 * (the legacy parking_location data used both shapes). Returns null when the input is
 * neither.
 */
export function ringOf(polygon: unknown): Ring | null {
  if (Array.isArray(polygon)) {
    return isPositionArray(polygon) ? polygon : null
  }
  if (polygon && typeof polygon === 'object') {
    const { type, coordinates } = polygon as { type?: unknown; coordinates?: unknown }
    if (type === 'Polygon' && Array.isArray(coordinates) && isPositionArray(coordinates[0])) {
      return coordinates[0]
    }
  }
  return null
}

export function toGeoJsonPolygon(ring: Ring): GeoJsonPolygon {
  return { type: 'Polygon', coordinates: [ring] }
}

/** True when the ring has >= 4 points (including the closing point), is closed, and all
 * coordinates are finite and within lng [-180, 180] / lat [-90, 90]. */
export function isValidRing(ring: unknown): ring is Ring {
  if (!isPositionArray(ring) || ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) return false
  return ring.every(
    ([lng, lat]) =>
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      Math.abs(lng) <= 180 &&
      Math.abs(lat) <= 90
  )
}

export function pointInArea(point: LngLat, polygon: unknown): boolean {
  const ring = ringOf(polygon)
  if (!ring || ring.length < 3) return false
  return pointInPolygon(point, ring)
}

/** Absolute planar area of a ring (shoelace). Only used to rank overlapping polygons. */
function ringArea(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(sum) / 2
}

/**
 * The area containing the point. When polygons overlap or nest, the one with the
 * smallest area wins, so a tie-down row inside a ramp zone is chosen over the ramp.
 */
export function findAreaAtPoint<T extends { polygon: unknown }>(
  point: LngLat,
  areas: readonly T[]
): T | null {
  let best: T | null = null
  let bestArea = Number.POSITIVE_INFINITY
  for (const area of areas) {
    const ring = ringOf(area.polygon)
    if (!ring || ring.length < 3 || !pointInPolygon(point, ring)) continue
    const size = ringArea(ring)
    if (size < bestArea) {
      best = area
      bestArea = size
    }
  }
  return best
}

/** Area-weighted centroid [lng, lat]; falls back to the vertex average for degenerate rings. */
export function polygonCentroid(ring: Ring): LngLat {
  const pts =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring

  let twiceArea = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
    twiceArea += cross
    cx += (pts[j][0] + pts[i][0]) * cross
    cy += (pts[j][1] + pts[i][1]) * cross
  }

  if (twiceArea === 0) {
    const n = pts.length || 1
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)]
}

/** [minLng, minLat, maxLng, maxLat] */
export function polygonBounds(ring: Ring): [number, number, number, number] {
  let minLng = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

const METRES_PER_DEGREE = 111_320

/** The ring's distinct corners: a closing point equal to the first is dropped. */
function distinctCorners(ring: Ring): Ring {
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  return closed ? ring.slice(0, -1) : ring
}

/**
 * One pass of `squareUpRing` in a local metric frame centred on `origin`. Screen axes: u
 * points right on screen (compass heading b + 90), v points up on screen (compass heading b).
 * With east x and north y: u = x cos b - y sin b, v = x sin b + y cos b.
 */
function fitScreenBox(corners: Ring, origin: LngLat, bearingDeg: number): Ring | null {
  const lngScale = Math.cos((origin[1] * Math.PI) / 180) * METRES_PER_DEGREE
  if (!(lngScale > 1e-3)) return null
  const rad = (bearingDeg * Math.PI) / 180
  const sin = Math.sin(rad)
  const cos = Math.cos(rad)

  let uMin = Number.POSITIVE_INFINITY
  let uMax = Number.NEGATIVE_INFINITY
  let vMin = Number.POSITIVE_INFINITY
  let vMax = Number.NEGATIVE_INFINITY
  for (const [lng, lat] of corners) {
    const x = (lng - origin[0]) * lngScale
    const y = (lat - origin[1]) * METRES_PER_DEGREE
    const u = x * cos - y * sin
    const v = x * sin + y * cos
    if (u < uMin) uMin = u
    if (u > uMax) uMax = u
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  if (!(uMax > uMin) || !(vMax > vMin)) return null

  const toLngLat = (u: number, v: number): LngLat => {
    const x = u * cos + v * sin
    const y = -u * sin + v * cos
    return [origin[0] + x / lngScale, origin[1] + y / METRES_PER_DEGREE]
  }
  // Clockwise as seen on screen, starting at the top-left corner.
  const box = [toLngLat(uMin, vMax), toLngLat(uMax, vMax), toLngLat(uMax, vMin), toLngLat(uMin, vMin)]
  return [...box, [box[0][0], box[0][1]]]
}

/**
 * Squares a shape up into the smallest rectangle that contains it and is aligned with the
 * map as the user sees it: `bearingDeg` is the map bearing (the compass heading pointing to
 * the top of the screen), so the rectangle's edges run parallel and perpendicular to it.
 *
 * Works in an equirectangular metric frame (east = dLng * cos(lat0) * 111320, north =
 * dLat * 111320) and rotates by the bearing to reach the screen frame. The frame is centred
 * on the corners' average first and re-centred on the resulting rectangle for a second pass,
 * so applying the function again to its own output changes nothing (the longitude scale
 * depends on the frame's latitude).
 *
 * Returns a closed 5-point ring: top-left, top-right, bottom-right, bottom-left (clockwise
 * on screen), top-left again. Degenerate input (fewer than 3 distinct corners, a shape with
 * no width or height on screen, non-finite numbers) is returned unchanged: the very same
 * array, so callers can detect "nothing to do" with `===`.
 */
export function squareUpRing(ring: Ring, bearingDeg: number): Ring {
  const corners = distinctCorners(ring)
  const distinct = new Set(corners.map(([lng, lat]) => `${lng},${lat}`))
  if (
    distinct.size < 3 ||
    !Number.isFinite(bearingDeg) ||
    !corners.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
  ) {
    return ring
  }

  const n = corners.length
  const mean: LngLat = [
    corners.reduce((sum, p) => sum + p[0], 0) / n,
    corners.reduce((sum, p) => sum + p[1], 0) / n
  ]
  const first = fitScreenBox(corners, mean, bearingDeg)
  if (!first) return ring
  const centre: LngLat = [
    first.slice(0, 4).reduce((sum, p) => sum + p[0], 0) / 4,
    first.slice(0, 4).reduce((sum, p) => sum + p[1], 0) / 4
  ]
  return fitScreenBox(first.slice(0, 4), centre, bearingDeg) ?? first
}
