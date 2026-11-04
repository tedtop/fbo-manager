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
