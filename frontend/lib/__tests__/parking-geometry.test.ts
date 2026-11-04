import { describe, expect, it } from 'vitest'
import {
  findAreaAtPoint,
  isValidRing,
  pointInArea,
  polygonBounds,
  polygonCentroid,
  ringOf,
  toGeoJsonPolygon,
} from '@/lib/parking-geometry'

const bigRing = [
  [-114.1, 46.9],
  [-114.0, 46.9],
  [-114.0, 47.0],
  [-114.1, 47.0],
  [-114.1, 46.9],
]
const smallRing = [
  [-114.06, 46.94],
  [-114.04, 46.94],
  [-114.04, 46.96],
  [-114.06, 46.96],
  [-114.06, 46.94],
]

describe('ringOf', () => {
  it('returns the outer ring of a GeoJSON Polygon', () => {
    expect(ringOf({ type: 'Polygon', coordinates: [bigRing] })).toEqual(bigRing)
  })

  it('returns a bare ring array as-is', () => {
    expect(ringOf(bigRing)).toEqual(bigRing)
  })

  it('returns null for unusable input', () => {
    expect(ringOf(null)).toBeNull()
    expect(ringOf(undefined)).toBeNull()
    expect(ringOf('nope')).toBeNull()
    expect(ringOf([])).toBeNull()
    expect(ringOf([[1, 'a']])).toBeNull()
    expect(ringOf({ type: 'Point', coordinates: [1, 2] })).toBeNull()
    expect(ringOf({ type: 'Polygon', coordinates: [] })).toBeNull()
  })
})

describe('toGeoJsonPolygon', () => {
  it('wraps a ring and round-trips through ringOf', () => {
    const poly = toGeoJsonPolygon(bigRing)
    expect(poly).toEqual({ type: 'Polygon', coordinates: [bigRing] })
    expect(ringOf(poly)).toEqual(bigRing)
  })
})

describe('isValidRing', () => {
  it('accepts a closed ring with >= 4 points', () => {
    expect(isValidRing(bigRing)).toBe(true)
  })

  it('rejects fewer than 4 points', () => {
    expect(isValidRing([[0, 0], [1, 1], [0, 0]])).toBe(false)
  })

  it('rejects an unclosed ring', () => {
    expect(isValidRing(bigRing.slice(0, -1))).toBe(false)
  })

  it('rejects non-finite and out-of-range coordinates', () => {
    expect(isValidRing([[0, 0], [1, 0], [Number.NaN, 1], [0, 0]])).toBe(false)
    expect(isValidRing([[0, 0], [181, 0], [1, 1], [0, 0]])).toBe(false)
    expect(isValidRing([[0, 0], [1, 0], [1, 91], [0, 0]])).toBe(false)
  })

  it('rejects non-arrays', () => {
    expect(isValidRing(null)).toBe(false)
    expect(isValidRing({ type: 'Polygon' })).toBe(false)
  })
})

describe('pointInArea', () => {
  it('works for both polygon shapes', () => {
    expect(pointInArea([-114.05, 46.95], { type: 'Polygon', coordinates: [bigRing] })).toBe(true)
    expect(pointInArea([-114.05, 46.95], bigRing)).toBe(true)
  })

  it('is false outside the polygon or for null/invalid polygons', () => {
    expect(pointInArea([-113.0, 46.95], bigRing)).toBe(false)
    expect(pointInArea([-114.05, 46.95], null)).toBe(false)
    expect(pointInArea([-114.05, 46.95], [[0, 0], [1, 1]])).toBe(false)
  })
})

describe('findAreaAtPoint', () => {
  const ramp = { id: 1, polygon: toGeoJsonPolygon(bigRing) }
  const tieDown = { id: 2, polygon: smallRing } // bare ring, nested inside the ramp
  const noPolygon = { id: 3, polygon: null }

  it('prefers the smallest containing area when polygons nest, regardless of order', () => {
    expect(findAreaAtPoint([-114.05, 46.95], [ramp, tieDown, noPolygon])?.id).toBe(2)
    expect(findAreaAtPoint([-114.05, 46.95], [tieDown, ramp])?.id).toBe(2)
  })

  it('falls back to the larger area outside the nested one', () => {
    expect(findAreaAtPoint([-114.09, 46.91], [ramp, tieDown])?.id).toBe(1)
  })

  it('returns null when no area contains the point', () => {
    expect(findAreaAtPoint([-100, 40], [ramp, tieDown, noPolygon])).toBeNull()
    expect(findAreaAtPoint([-114.05, 46.95], [])).toBeNull()
  })
})

describe('polygonCentroid', () => {
  it('returns the center of a rectangle', () => {
    const [lng, lat] = polygonCentroid(bigRing)
    expect(lng).toBeCloseTo(-114.05, 6)
    expect(lat).toBeCloseTo(46.95, 6)
  })

  it('falls back to the vertex average for a degenerate (zero-area) ring', () => {
    expect(polygonCentroid([[0, 0], [2, 2], [4, 4], [0, 0]])).toEqual([2, 2])
  })
})

describe('polygonBounds', () => {
  it('returns [minLng, minLat, maxLng, maxLat]', () => {
    expect(polygonBounds(bigRing)).toEqual([-114.1, 46.9, -114.0, 47.0])
  })
})
