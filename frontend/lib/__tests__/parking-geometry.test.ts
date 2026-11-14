import { describe, expect, it } from 'vitest'
import {
  findAreaAtPoint,
  isValidRing,
  pointInArea,
  polygonBounds,
  polygonCentroid,
  recomputeParkedAreas,
  ringOf,
  squareUpRing,
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

// --- squareUpRing -------------------------------------------------------------------------

const M = 111_320

/** Metric offsets of a ring around its centre, using the module's equirectangular frame. */
function toMetric(ring: number[][], centre: [number, number]) {
  const lngScale = Math.cos((centre[1] * Math.PI) / 180) * M
  return ring.map(([lng, lat]) => [(lng - centre[0]) * lngScale, (lat - centre[1]) * M])
}

/** Compass heading (deg, 0..360) of the edge a -> b in metric east/north offsets. */
function heading(a: number[], b: number[]): number {
  const deg = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Smallest angular distance between two angles modulo 90 degrees. */
function modDistance90(a: number, b: number): number {
  const d = (((a - b) % 90) + 90) % 90
  return Math.min(d, 90 - d)
}

/**
 * Rectangle in the canonical order of squareUpRing (screen top-left, top-right, bottom-right,
 * bottom-left, closed), centred on `centre`, `width` metres across the screen and `height`
 * metres up it, for a map at `bearing` degrees.
 */
function rectangleForBearing(centre: [number, number], width: number, height: number, bearing: number) {
  const lngScale = Math.cos((centre[1] * Math.PI) / 180) * M
  const rad = (bearing * Math.PI) / 180
  const at = (u: number, v: number): [number, number] => {
    const x = u * Math.cos(rad) + v * Math.sin(rad)
    const y = -u * Math.sin(rad) + v * Math.cos(rad)
    return [centre[0] + x / lngScale, centre[1] + y / M]
  }
  const hw = width / 2
  const hh = height / 2
  const corners = [at(-hw, hh), at(hw, hh), at(hw, -hh), at(-hw, -hh)]
  return [...corners, corners[0]]
}

function expectRingsClose(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach(([lng, lat], i) => {
    expect(Math.abs(lng - expected[i][0])).toBeLessThan(1e-9)
    expect(Math.abs(lat - expected[i][1])).toBeLessThan(1e-9)
  })
}

const skewedQuad = [
  [-114.0, 46.9],
  [-113.9985, 46.9004],
  [-113.9978, 46.9013],
  [-113.9996, 46.9009],
  [-114.0, 46.9],
]

describe('squareUpRing', () => {
  it('at bearing 0 returns the plain lng/lat bounding box, clockwise from top-left', () => {
    const result = squareUpRing(skewedQuad, 0)
    expect(result).toHaveLength(5)
    const [minLng, minLat, maxLng, maxLat] = polygonBounds(skewedQuad)
    const expected = [
      [minLng, maxLat],
      [maxLng, maxLat],
      [maxLng, minLat],
      [minLng, minLat],
      [minLng, maxLat],
    ]
    expectRingsClose(result, expected)
  })

  it.each([0, 40, 90, 137.5, -30, 270])(
    'returns a rectangle already aligned with bearing %s unchanged, and again on a second pass',
    (bearing) => {
      const rect = rectangleForBearing([-114.05, 46.95], 120, 70, bearing)
      const once = squareUpRing(rect, bearing)
      expectRingsClose(once, rect)
      expectRingsClose(squareUpRing(once, bearing), rect)
    }
  )

  it('is idempotent for an irregular shape', () => {
    const once = squareUpRing(skewedQuad, 40)
    expectRingsClose(squareUpRing(once, 40), once)
  })

  it('does not depend on where the ring starts or which way it winds', () => {
    const open = skewedQuad.slice(0, 4)
    const reversed = [...open].reverse()
    const rotated = [open[2], open[3], open[0], open[1]]
    const expected = squareUpRing(skewedQuad, 40)
    expectRingsClose(squareUpRing([...reversed, reversed[0]], 40), expected)
    expectRingsClose(squareUpRing([...rotated, rotated[0]], 40), expected)
    expectRingsClose(squareUpRing(open, 40), expected)
  })

  it.each([0, 40, 215])(
    'turns a skewed quad into a rectangle whose edges run along compass heading %s',
    (bearing) => {
      const result = squareUpRing(skewedQuad, bearing)
      const centre: [number, number] = [
        result.slice(0, 4).reduce((s, p) => s + p[0], 0) / 4,
        result.slice(0, 4).reduce((s, p) => s + p[1], 0) / 4,
      ]
      const metric = toMetric(result, centre)
      const headings = [0, 1, 2, 3].map((i) => heading(metric[i], metric[i + 1]))

      // every edge is parallel or perpendicular to the map's up direction
      for (const h of headings) expect(modDistance90(h, bearing)).toBeLessThan(1e-3)
      // consecutive edges meet at 90 degrees
      for (let i = 0; i < 4; i++) {
        const turn = (((headings[(i + 1) % 4] - headings[i]) % 360) + 360) % 360
        expect(Math.abs(turn - 90)).toBeLessThan(1e-3)
      }
      // opposite sides are equally long
      const len = (i: number) => Math.hypot(metric[i + 1][0] - metric[i][0], metric[i + 1][1] - metric[i][1])
      expect(Math.abs(len(0) - len(2))).toBeLessThan(1e-3)
      expect(Math.abs(len(1) - len(3))).toBeLessThan(1e-3)
    }
  )

  it('contains every original corner', () => {
    const result = squareUpRing(skewedQuad, 40)
    for (const corner of skewedQuad) {
      expect(pointInArea([corner[0], corner[1]], result)).toBe(true)
    }
  })

  it('returns a valid, closed 5-point ring', () => {
    for (const bearing of [0, 40, -75, 359]) {
      const result = squareUpRing(skewedQuad, bearing)
      expect(result).toHaveLength(5)
      expect(isValidRing(result)).toBe(true)
      expect(result[0]).toEqual(result[4])
    }
  })

  it('returns degenerate input unchanged (same array)', () => {
    const twoPoints = [[-114, 47], [-113.99, 47.01], [-114, 47]]
    const repeated = [[-114, 47], [-114, 47], [-114, 47], [-114, 47]]
    const collinearOnAxis = [[-114, 47], [-113.99, 47], [-113.98, 47], [-114, 47]]
    expect(squareUpRing(twoPoints, 40)).toBe(twoPoints)
    expect(squareUpRing(repeated, 0)).toBe(repeated)
    expect(squareUpRing(collinearOnAxis, 0)).toBe(collinearOnAxis)
    expect(squareUpRing([], 0)).toEqual([])
    expect(squareUpRing(skewedQuad, Number.NaN)).toBe(skewedQuad)
  })
})

describe('recomputeParkedAreas', () => {
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    toGeoJsonPolygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]])
  const big = { id: 1, polygon: box(0, 0, 10, 10) }
  const small = { id: 2, polygon: box(2, 2, 4, 4) }
  const plane = (tailNumber: string, lng: number, lat: number, areaId: number | null) => ({
    tailNumber,
    lat,
    lng,
    areaId,
  })

  it('returns nothing when every stored area already matches', () => {
    expect(recomputeParkedAreas([plane('N1', 3, 3, 2), plane('N2', 8, 8, 1), plane('N3', 20, 20, null)], [big, small])).toEqual([])
  })

  it('moves a plane that is now inside a smaller area, and drops one that left every area', () => {
    const changes = recomputeParkedAreas([plane('N1', 3, 3, 1), plane('N2', 20, 20, 1)], [big, small])
    expect(changes).toEqual([
      { tailNumber: 'N1', areaId: 2 },
      { tailNumber: 'N2', areaId: null },
    ])
  })

  it('assigns an area to a plane that had none once a boundary grows over it', () => {
    expect(recomputeParkedAreas([plane('N1', 12, 5, null)], [{ id: 1, polygon: box(0, 0, 15, 10) }])).toEqual([
      { tailNumber: 'N1', areaId: 1 },
    ])
  })

  it('ignores areas without a usable polygon', () => {
    expect(recomputeParkedAreas([plane('N1', 3, 3, 1)], [{ id: 1, polygon: null }])).toEqual([
      { tailNumber: 'N1', areaId: null },
    ])
  })
})
