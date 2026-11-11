import { describe, expect, it } from 'vitest'
import {
  MIN_RECT_SIDE_M,
  isRectangle,
  rectangularizeRing,
  resizeRectCorner,
  resizeRectEdge
} from '../rect-geometry'

const M = 111_320
const CENTRE: [number, number] = [-114.05, 46.95]
const LNG_SCALE = Math.cos((CENTRE[1] * Math.PI) / 180) * M

type Metric = [number, number]

const toMetric = (p: number[]): Metric => [
  (p[0] - CENTRE[0]) * LNG_SCALE,
  (p[1] - CENTRE[1]) * M
]
const toPoint = ([x, y]: Metric): number[] => [
  CENTRE[0] + x / LNG_SCALE,
  CENTRE[1] + y / M
]

/**
 * Rectangle `w` x `h` metres with its first side heading `deg` degrees counter-clockwise from
 * east, corners in order: start, along the first side, across, back. Closed 5-point ring.
 * `dx` / `dy` shift the centre in metres.
 */
function rect(w: number, h: number, deg: number, dx = 0, dy = 0): number[][] {
  const rad = (deg * Math.PI) / 180
  const u: Metric = [Math.cos(rad), Math.sin(rad)]
  const v: Metric = [-u[1], u[0]]
  const at = (a: number, b: number): number[] =>
    toPoint([dx + u[0] * a + v[0] * b, dy + u[1] * a + v[1] * b])
  const corners = [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)]
  return [...corners, corners[0]]
}

/** Worst deviation from a perfect rectangle in metres (parallelogram skew and right angle). */
function rectError(ring: number[][]): number {
  // In the frame centred on the ring itself, the one the rectangle is exact in.
  const mean = [0, 1].map((k) => ring.slice(0, 4).reduce((sum, p) => sum + p[k], 0) / 4)
  const scaleX = Math.cos((mean[1] * Math.PI) / 180) * M
  const [p0, p1, p2, p3] = ring
    .slice(0, 4)
    .map((p): Metric => [(p[0] - mean[0]) * scaleX, (p[1] - mean[1]) * M])
  const skew = Math.hypot(p0[0] + p2[0] - p1[0] - p3[0], p0[1] + p2[1] - p1[1] - p3[1])
  const e0: Metric = [p1[0] - p0[0], p1[1] - p0[1]]
  const e1: Metric = [p2[0] - p1[0], p2[1] - p1[1]]
  const sine = Math.abs(e0[0] * e1[0] + e0[1] * e1[1]) / Math.hypot(...e0)
  return Math.max(skew, sine)
}

const dist = (a: number[], b: number[]): number => {
  const [ax, ay] = toMetric(a)
  const [bx, by] = toMetric(b)
  return Math.hypot(ax - bx, ay - by)
}

const sides = (ring: number[][]): [number, number] => [dist(ring[0], ring[1]), dist(ring[1], ring[2])]

const expectClosedRect = (ring: number[][]) => {
  expect(ring).toHaveLength(5)
  expect(ring[4]).toEqual(ring[0])
  expect(rectError(ring)).toBeLessThan(1e-6)
  expect(isRectangle(ring, 1e-7)).toBe(true)
}

const HEADINGS = [0, 40, 130]

describe('isRectangle', () => {
  it.each(HEADINGS)('accepts a rectangle at heading %s (closed ring)', (deg) => {
    expect(isRectangle(rect(60, 25, deg))).toBe(true)
  })

  it('accepts an unclosed ring and the reverse winding', () => {
    const closedRing = rect(60, 25, 40)
    expect(isRectangle(closedRing.slice(0, 4))).toBe(true)
    expect(isRectangle([...closedRing].reverse())).toBe(true)
  })

  it('accepts a square', () => {
    expect(isRectangle(rect(30, 30, 17))).toBe(true)
  })

  it('rejects a parallelogram, a trapezoid and a kite', () => {
    const base = rect(60, 25, 0).map(toMetric)
    const shifted = base.map(([x, y], i): Metric => (i === 2 || i === 3 ? [x + 10, y] : [x, y]))
    expect(isRectangle([...shifted.map(toPoint)])).toBe(false)
    const trapezoid = base.map(([x, y], i): Metric => (i === 2 ? [x - 12, y] : [x, y]))
    expect(isRectangle(trapezoid.map(toPoint))).toBe(false)
    const kite: Metric[] = [
      [0, -20],
      [10, 0],
      [0, 30],
      [-10, 0]
    ]
    expect(isRectangle(kite.map(toPoint))).toBe(false)
  })

  it('rejects a bow-tie ordering of rectangle corners', () => {
    const r = rect(60, 25, 0)
    expect(isRectangle([r[0], r[2], r[1], r[3], r[0]])).toBe(false)
  })

  it('rejects other corner counts, degenerate and non-finite input', () => {
    expect(isRectangle([[0, 0], [1, 0], [0, 1], [0, 0]])).toBe(false)
    const five = [...rect(60, 25, 0).slice(0, 4), toPoint([0, 0]), rect(60, 25, 0)[0]]
    expect(isRectangle(five)).toBe(false)
    expect(isRectangle(null)).toBe(false)
    expect(isRectangle('x')).toBe(false)
    expect(isRectangle([])).toBe(false)
    expect(isRectangle(rect(0.001, 20, 0))).toBe(false)
    const bad = rect(60, 25, 0)
    bad[1] = [Number.NaN, 1]
    expect(isRectangle(bad)).toBe(false)
  })

  it('honours the tolerance', () => {
    const r = rect(60, 25, 40).map(toMetric)
    r[2] = [r[2][0] + 0.2, r[2][1]]
    const nudged = r.map(toPoint)
    expect(isRectangle(nudged, 1e-3)).toBe(false)
    expect(isRectangle(nudged, 0.05)).toBe(true)
  })
})

describe('rectangularizeRing', () => {
  it.each(HEADINGS)(
    'wraps a rotated polygon in a rectangle of its own orientation (heading %s)',
    (deg) => {
      // A rectangle with one corner pulled inwards: the bounding rectangle is the original one.
      const original = rect(80, 30, deg)
      const dented = [original[0], original[1], toPoint(lerp(toMetric(original[2]), [0, 0], 0.4)), original[3], original[0]]
      const result = rectangularizeRing(dented)
      expectClosedRect(result)
      const [a, b] = sides(result)
      expect([a, b].sort((x, y) => x - y)[0]).toBeCloseTo(30, 3)
      expect([a, b].sort((x, y) => x - y)[1]).toBeCloseTo(80, 3)
      // Same orientation: the long side runs at the original heading (mod 180).
      const long = a > b ? [result[0], result[1]] : [result[1], result[2]]
      const [lx, ly] = [toMetric(long[1])[0] - toMetric(long[0])[0], toMetric(long[1])[1] - toMetric(long[0])[1]]
      const angle = ((Math.atan2(ly, lx) * 180) / Math.PI + 360) % 180
      expect(Math.abs(angle - (deg % 180))).toBeLessThan(1e-3)
    }
  )

  it('contains every input corner', () => {
    const ring = [
      ...[
        [0, 0],
        [40, 5],
        [45, 30],
        [20, 22],
        [-6, 28]
      ].map((p) => toPoint(p as Metric)),
      toPoint([0, 0])
    ]
    const result = rectangularizeRing(ring)
    expectClosedRect(result)
    const [p0, p1, , p3] = result.slice(0, 4).map(toMetric)
    const e0: Metric = [p1[0] - p0[0], p1[1] - p0[1]]
    const e1: Metric = [p3[0] - p0[0], p3[1] - p0[1]]
    const l0 = Math.hypot(...e0)
    const l1 = Math.hypot(...e1)
    for (const corner of ring.slice(0, 5).map(toMetric)) {
      const d: Metric = [corner[0] - p0[0], corner[1] - p0[1]]
      const s = (d[0] * e0[0] + d[1] * e0[1]) / l0
      const t = (d[0] * e1[0] + d[1] * e1[1]) / l1
      expect(s).toBeGreaterThan(-1e-3)
      expect(s).toBeLessThan(l0 + 1e-3)
      expect(t).toBeGreaterThan(-1e-3)
      expect(t).toBeLessThan(l1 + 1e-3)
    }
  })

  it('picks the smaller of the two orientations for an L shape', () => {
    // An L tilted 40 degrees: the minimum-area box is flush with the tilted sides.
    const lShape: Metric[] = [
      [0, 0],
      [60, 0],
      [60, 20],
      [20, 20],
      [20, 50],
      [0, 50]
    ]
    const rad = (40 * Math.PI) / 180
    const turned = lShape.map(([x, y]): Metric => [
      x * Math.cos(rad) - y * Math.sin(rad),
      x * Math.sin(rad) + y * Math.cos(rad)
    ])
    const ring = [...turned.map(toPoint), toPoint(turned[0])]
    const result = rectangularizeRing(ring)
    expectClosedRect(result)
    const [a, b] = sides(result)
    expect(a * b).toBeCloseTo(60 * 50, 1)
  })

  it('turns a triangle into the rectangle flush with its longest edge or smaller', () => {
    const triangle = [...[[0, 0], [40, 0], [10, 20]].map((p) => toPoint(p as Metric)), toPoint([0, 0])]
    const result = rectangularizeRing(triangle)
    expectClosedRect(result)
    const [a, b] = sides(result)
    expect(a * b).toBeLessThanOrEqual(40 * 20 + 0.01)
  })

  it('leaves a rectangle as it is (the same array)', () => {
    const r = rect(60, 25, 40)
    expect(rectangularizeRing(r)).toBe(r)
  })

  it('is stable: a second pass changes nothing', () => {
    const ring = [...[[0, 0], [40, 5], [45, 30], [-6, 28]].map((p) => toPoint(p as Metric)), toPoint([0, 0])]
    const once = rectangularizeRing(ring)
    expect(rectangularizeRing(once)).toBe(once)
  })

  it('returns degenerate input unchanged', () => {
    const line = [[0, 0], [10, 0], [20, 0], [0, 0]].map((p) => toPoint(p as Metric))
    expect(rectangularizeRing(line)).toBe(line)
    const twoPoints = [toPoint([0, 0]), toPoint([5, 5]), toPoint([0, 0])]
    expect(rectangularizeRing(twoPoints)).toBe(twoPoints)
    const tiny = [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]].map((p) => toPoint(p as Metric))
    expect(rectangularizeRing(tiny)).toBe(tiny)
    const nan = [[0, 0], [Number.NaN, 1], [3, 3], [0, 0]]
    expect(rectangularizeRing(nan)).toBe(nan)
    expect(rectangularizeRing([])).toEqual([])
  })
})

describe('resizeRectCorner', () => {
  it.each(HEADINGS)('keeps the opposite corner and stays a rectangle (heading %s)', (deg) => {
    const r = rect(60, 25, deg)
    for (let corner = 0; corner < 4; corner++) {
      // Drag the corner out of the rectangle, in a direction unrelated to its axes.
      const [cx, cy] = toMetric(r[corner])
      const result = resizeRectCorner(r, corner, toPoint([cx + 13, cy - 9]))
      expectClosedRect(result)
      const opposite = (corner + 2) % 4
      expect(dist(result[opposite], r[opposite])).toBeLessThan(1e-3)
      expect(dist(result[corner], r[corner])).toBeGreaterThan(1)
    }
  })

  it('places the moved corner at the projection of the pointer onto the rectangle axes', () => {
    const r = rect(60, 20, 0) // corner 2 is the top-right one
    const result = resizeRectCorner(r, 2, toPoint([50, 30]))
    expectClosedRect(result)
    const [w, h] = sides(result)
    expect(w).toBeCloseTo(80, 3)
    expect(h).toBeCloseTo(40, 3)
  })

  it('scales the rectangle when a corner moves along its diagonal', () => {
    const r = rect(60, 20, 40)
    const result = resizeRectCorner(r, 2, toPoint(lerp(toMetric(r[0]), toMetric(r[2]), 1.5)))
    expectClosedRect(result)
    const [a, b] = sides(result)
    expect(a).toBeCloseTo(90, 3)
    expect(b).toBeCloseTo(30, 3)
  })

  it.each(HEADINGS)('never inverts or collapses past the opposite corner (heading %s)', (deg) => {
    const r = rect(60, 25, deg)
    // Far beyond the opposite corner, on both axes.
    const [ox, oy] = toMetric(r[0])
    const result = resizeRectCorner(r, 2, toPoint([ox - 200, oy - 200]))
    expectClosedRect(result)
    const [a, b] = sides(result)
    expect(a).toBeGreaterThanOrEqual(MIN_RECT_SIDE_M - 1e-6)
    expect(b).toBeGreaterThanOrEqual(MIN_RECT_SIDE_M - 1e-6)
    // Winding is kept: the signed area has the sign of the input's.
    expect(signedArea(result)).toBeGreaterThan(0)
    expect(Math.sign(signedArea(result))).toBe(Math.sign(signedArea(r)))
  })

  it('keeps the winding of a clockwise ring', () => {
    const r = [...rect(60, 25, 40)].reverse()
    const result = resizeRectCorner(r, 1, toPoint(lerp(toMetric(r[1]), [0, 0], -0.5)))
    expectClosedRect(result)
    expect(Math.sign(signedArea(result))).toBe(Math.sign(signedArea(r)))
  })

  it('returns invalid input unchanged', () => {
    const r = rect(60, 25, 40)
    expect(resizeRectCorner(r, 4, r[0])).toBe(r)
    expect(resizeRectCorner(r, -1, r[0])).toBe(r)
    expect(resizeRectCorner(r, 1.5, r[0])).toBe(r)
    expect(resizeRectCorner(r, 1, [Number.NaN, 0])).toBe(r)
    const tri = [[0, 0], [1, 0], [0, 1], [0, 0]]
    expect(resizeRectCorner(tri, 0, [1, 1])).toBe(tri)
    const thin = rect(60, 0.2, 40)
    expect(resizeRectCorner(thin, 2, r[0])).toBe(thin)
  })
})

describe('resizeRectEdge', () => {
  it.each(HEADINGS)('moves one side only and stays a rectangle (heading %s)', (deg) => {
    const r = rect(60, 25, deg)
    for (let edge = 0; edge < 4; edge++) {
      const mid = lerp(toMetric(r[edge]), toMetric(r[edge + 1]), 0.5)
      const [a, b] = [toMetric(r[edge]), toMetric(r[edge + 1])]
      const along: Metric = [b[0] - a[0], b[1] - a[1]]
      const len = Math.hypot(...along)
      // Outward normal of this side.
      const centre = toMetric(r[0]).map((v, i) => (v + toMetric(r[2])[i]) / 2) as Metric
      let normal: Metric = [-along[1] / len, along[0] / len]
      if ((mid[0] - centre[0]) * normal[0] + (mid[1] - centre[1]) * normal[1] < 0) {
        normal = [-normal[0], -normal[1]]
      }
      // Pointer 12 m outward, also 7 m sideways: the sideways part must be ignored.
      const target = toPoint([
        mid[0] + normal[0] * 12 + (along[0] / len) * 7,
        mid[1] + normal[1] * 12 + (along[1] / len) * 7
      ])
      const result = resizeRectEdge(r, edge, target)
      expectClosedRect(result)
      // The other side stays; the two neighbours keep their directions.
      expect(dist(result[(edge + 2) % 4], r[(edge + 2) % 4])).toBeLessThan(1e-3)
      expect(dist(result[(edge + 3) % 4], r[(edge + 3) % 4])).toBeLessThan(1e-3)
      // The moved side's length is unchanged, the extent grew by 12 m.
      expect(dist(result[edge], result[(edge + 1) % 4])).toBeCloseTo(len, 3)
      const grown = dist(result[edge], result[(edge + 3) % 4])
      const before = dist(r[edge], r[(edge + 3) % 4])
      expect(grown).toBeCloseTo(before + 12, 3)
    }
  })

  it('can shrink a side towards the opposite one', () => {
    const r = rect(60, 20, 0) // edge 2 is the top one
    const result = resizeRectEdge(r, 2, toPoint([0, 10 - 8]))
    expectClosedRect(result)
    expect(sides(result)[1]).toBeCloseTo(12, 3)
    expect(sides(result)[0]).toBeCloseTo(60, 3)
  })

  it.each(HEADINGS)('never inverts or collapses past the opposite side (heading %s)', (deg) => {
    const r = rect(60, 25, deg)
    for (let edge = 0; edge < 4; edge++) {
      const far = toPoint([toMetric(r[(edge + 2) % 4])[0] - 300, toMetric(r[(edge + 2) % 4])[1] - 300])
      const result = resizeRectEdge(r, edge, far)
      expectClosedRect(result)
      expect(dist(result[edge], result[(edge + 3) % 4])).toBeGreaterThanOrEqual(MIN_RECT_SIDE_M - 1e-6)
      expect(Math.sign(signedArea(result))).toBe(Math.sign(signedArea(r)))
    }
  })

  it('returns invalid input unchanged', () => {
    const r = rect(60, 25, 40)
    expect(resizeRectEdge(r, 4, r[0])).toBe(r)
    expect(resizeRectEdge(r, 0, [Number.POSITIVE_INFINITY, 0])).toBe(r)
    const tri = [[0, 0], [1, 0], [0, 1], [0, 0]]
    expect(resizeRectEdge(tri, 0, [1, 1])).toBe(tri)
  })
})

function lerp(a: Metric, b: Metric, t: number): Metric {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function signedArea(ring: number[][]): number {
  const pts = ring.map(toMetric)
  let sum = 0
  for (let i = 0; i < pts.length - 1; i++) {
    sum += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
  }
  return sum / 2
}
