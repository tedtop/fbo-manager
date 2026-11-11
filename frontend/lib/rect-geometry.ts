import type { LngLat, Ring } from '@/lib/parking-geometry'

/**
 * Rectangles of any heading, stored as the usual closed 5-point ring. Everything runs in the
 * same equirectangular metric frame as `squareUpRing` (east = dLng * cos(lat0) * 111320,
 * north = dLat * 111320), centred on the rectangle's own corners, so right angles are right
 * angles on the ground and not just in degrees.
 */

const METRES_PER_DEGREE = 111_320

/** Resizing never makes a side shorter than this; a shape below it is left alone. */
export const MIN_RECT_SIDE_M = 0.5
/** Default `isRectangle` tolerance, relative to the rectangle's size (0.1 %). */
export const RECT_TOLERANCE = 1e-3
/** Sides shorter than this are not a rectangle at all. */
const MIN_RECT_SIDE_ABS_M = 0.01

type XY = [number, number]

type Frame = {
  toXY: (point: number[]) => XY
  toLngLat: (xy: XY) => LngLat
}

function frameAt(lng0: number, lat0: number): Frame | null {
  const lngScale = Math.cos((lat0 * Math.PI) / 180) * METRES_PER_DEGREE
  if (!(lngScale > 1e-3)) return null
  return {
    toXY: ([lng, lat]) => [(lng - lng0) * lngScale, (lat - lat0) * METRES_PER_DEGREE],
    toLngLat: ([x, y]) => [lng0 + x / lngScale, lat0 + y / METRES_PER_DEGREE]
  }
}

/** The ring's distinct corners: a closing point equal to the first is dropped. */
function openCorners(ring: Ring): Ring {
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  return closed ? ring.slice(0, -1) : ring
}

function allFinite(points: Ring): boolean {
  return points.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
}

function meanOf(points: Ring): LngLat {
  const n = points.length
  return [
    points.reduce((sum, p) => sum + p[0], 0) / n,
    points.reduce((sum, p) => sum + p[1], 0) / n
  ]
}

function closed(corners: LngLat[]): Ring {
  return [...corners, [corners[0][0], corners[0][1]]]
}

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]]
const add = (a: XY, b: XY): XY => [a[0] + b[0], a[1] + b[1]]
const scale = (a: XY, k: number): XY => [a[0] * k, a[1] * k]
const dot = (a: XY, b: XY): number => a[0] * b[0] + a[1] * b[1]
const length = (a: XY): number => Math.hypot(a[0], a[1])

/**
 * Refits four corners (in ring order, a rectangle within the distortion of the frame they
 * were computed in) to a rectangle that is exact in the frame centred on their own average,
 * which is the frame `isRectangle` looks at them in. The longitude scale depends on the
 * frame's latitude, so a rectangle built in one frame is off by a few parts per million in
 * another; this removes that. Corners move by far less than a millimetre.
 */
function refit(corners: LngLat[]): Ring {
  const [lng0, lat0] = meanOf(corners)
  const frame = frameAt(lng0, lat0)
  if (!frame) return closed(corners)
  const [p0, p1, p2, p3] = corners.map(frame.toXY)
  const alongSum = add(sub(p1, p0), sub(p2, p3))
  const len = length(alongSum)
  if (!(len > 0)) return closed(corners)
  const a: XY = [alongSum[0] / len, alongSum[1] / len]
  const perp: XY = [-a[1], a[0]]
  const n = dot(sub(p3, p0), perp) >= 0 ? perp : scale(perp, -1)
  const w = (dot(sub(p1, p0), a) + dot(sub(p2, p3), a)) / 2
  const h = (dot(sub(p3, p0), n) + dot(sub(p2, p1), n)) / 2
  const centre: XY = [
    (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
    (p0[1] + p1[1] + p2[1] + p3[1]) / 4
  ]
  const at = (sa: number, sn: number): LngLat =>
    frame.toLngLat(add(centre, add(scale(a, (sa * w) / 2), scale(n, (sn * h) / 2))))
  return closed([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)])
}

/**
 * The four corners of a rectangular ring and the frame they live in, or null when the ring
 * does not have exactly four finite corners.
 */
function rectCorners(ring: Ring): { frame: Frame; xy: XY[] } | null {
  const corners = openCorners(ring)
  if (corners.length !== 4 || !allFinite(corners)) return null
  const [lng0, lat0] = meanOf(corners)
  const frame = frameAt(lng0, lat0)
  if (!frame) return null
  return { frame, xy: corners.map(frame.toXY) }
}

/**
 * True when the ring is a rectangle of any heading: four corners (closed or not), opposite
 * sides equal and parallel, adjacent sides perpendicular, all within `tol` (relative to the
 * rectangle's own size) and every side at least a centimetre long. Corners in either winding
 * order count.
 */
export function isRectangle(ring: unknown, tol: number = RECT_TOLERANCE): boolean {
  if (!Array.isArray(ring)) return false
  const parts = rectCorners(ring as Ring)
  if (!parts) return false
  const [p0, p1, p2, p3] = parts.xy
  const e0 = sub(p1, p0)
  const e1 = sub(p2, p1)
  const l0 = length(e0)
  const l1 = length(e1)
  if (l0 < MIN_RECT_SIDE_ABS_M || l1 < MIN_RECT_SIDE_ABS_M) return false
  // p0 + p2 = p1 + p3 makes it a parallelogram.
  const skew = length(sub(add(p0, p2), add(p1, p3)))
  if (skew > tol * Math.hypot(l0, l1)) return false
  return Math.abs(dot(e0, e1)) <= tol * l0 * l1
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeated first point. */
function convexHull(points: XY[]): XY[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: XY, a: XY, b: XY) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const build = (pts: XY[]) => {
    const out: XY[] = []
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) {
        out.pop()
      }
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...build(sorted), ...build([...sorted].reverse())]
}

/**
 * ONE-action "Make rectangle": the smallest-area oriented rectangle that contains the shape.
 * Unlike `squareUpRing` it keeps the shape's own orientation (the minimum-area rectangle has
 * a side flush with one hull edge, so those edge angles are the only candidates) instead of
 * aligning to the screen.
 *
 * Returns a closed 5-point ring, clockwise as seen north-up, starting at the top-left corner
 * of the rectangle's own frame. A shape that already is a rectangle is returned as the very
 * same array. Degenerate input (fewer than 3 distinct corners, collinear corners, a side
 * under `MIN_RECT_SIDE_M`, non-finite numbers) is returned unchanged too, so callers can
 * tell "nothing to do" from a result with `===`.
 */
export function rectangularizeRing(ring: Ring): Ring {
  if (isRectangle(ring)) return ring
  const corners = openCorners(ring)
  const distinct = new Set(corners.map(([lng, lat]) => `${lng},${lat}`))
  if (distinct.size < 3 || !allFinite(corners)) return ring

  const [lng0, lat0] = meanOf(corners)
  const frame = frameAt(lng0, lat0)
  if (!frame) return ring
  const hull = convexHull(corners.map(frame.toXY))
  if (hull.length < 3) return ring

  let best: { area: number; angle: number; box: [number, number, number, number] } | null = null
  for (let i = 0; i < hull.length; i++) {
    const edge = sub(hull[(i + 1) % hull.length], hull[i])
    const len = length(edge)
    if (!(len > 0)) continue
    const u: XY = [edge[0] / len, edge[1] / len]
    const v: XY = [-u[1], u[0]]
    let uMin = Number.POSITIVE_INFINITY
    let uMax = Number.NEGATIVE_INFINITY
    let vMin = Number.POSITIVE_INFINITY
    let vMax = Number.NEGATIVE_INFINITY
    for (const p of hull) {
      const pu = dot(p, u)
      const pv = dot(p, v)
      if (pu < uMin) uMin = pu
      if (pu > uMax) uMax = pu
      if (pv < vMin) vMin = pv
      if (pv > vMax) vMax = pv
    }
    const area = (uMax - uMin) * (vMax - vMin)
    // Strictly smaller by a hair, so equal candidates keep the first (stable result).
    if (!best || area < best.area * (1 - 1e-12)) {
      best = { area, angle: Math.atan2(u[1], u[0]), box: [uMin, uMax, vMin, vMax] }
    }
  }
  if (!best) return ring
  const [uMin, uMax, vMin, vMax] = best.box
  if (uMax - uMin < MIN_RECT_SIDE_M || vMax - vMin < MIN_RECT_SIDE_M) return ring

  const u: XY = [Math.cos(best.angle), Math.sin(best.angle)]
  const v: XY = [-u[1], u[0]]
  const at = (pu: number, pv: number): LngLat =>
    frame.toLngLat(add(scale(u, pu), scale(v, pv)))
  return refit([at(uMin, vMax), at(uMax, vMax), at(uMax, vMin), at(uMin, vMin)])
}

/**
 * Orthonormal axes of a rectangle: `a` runs along its first side (corner 0 to corner 1) and
 * `n` is perpendicular to it, pointing to the side where corner 3 lies.
 */
function axesOf(xy: XY[]): { a: XY; n: XY } | null {
  const e0 = sub(xy[1], xy[0])
  const l0 = length(e0)
  if (!(l0 > 0)) return null
  const a: XY = [e0[0] / l0, e0[1] / l0]
  const perp: XY = [-a[1], a[0]]
  const n = dot(sub(xy[3], xy[0]), perp) >= 0 ? perp : scale(perp, -1)
  return { a, n }
}

/**
 * Drags corner `cornerIndex` (0..3, ring order) of a rectangle to `newPoint` with the
 * opposite corner fixed. The point is projected into the rectangle's own axes, so the result
 * is an exact rectangle of the same heading whatever the direction of the drag, and the
 * corner never crosses its opposite one: each side keeps at least `MIN_RECT_SIDE_M`.
 *
 * Returns a closed 5-point ring with the corners in their original order. A ring that is not
 * a (near-)rectangle, a bad index or point, or a rectangle under `MIN_RECT_SIDE_M` comes back
 * as the same array.
 */
export function resizeRectCorner(ring: Ring, cornerIndex: number, newPoint: number[]): Ring {
  const parts = rectCorners(ring)
  if (
    !parts ||
    !Number.isInteger(cornerIndex) ||
    cornerIndex < 0 ||
    cornerIndex > 3 ||
    !allFinite([newPoint]) ||
    !isRectangle(ring, 0.05)
  ) {
    return ring
  }
  const { frame, xy } = parts
  const axes = axesOf(xy)
  if (!axes) return ring
  const { a, n } = axes

  const opposite = xy[(cornerIndex + 2) % 4]
  const moved = sub(xy[cornerIndex], opposite)
  const s0 = dot(moved, a)
  const t0 = dot(moved, n)
  if (Math.abs(s0) < MIN_RECT_SIDE_M || Math.abs(t0) < MIN_RECT_SIDE_M) return ring

  const target = sub(frame.toXY(newPoint), opposite)
  const s = Math.sign(s0) * Math.max(MIN_RECT_SIDE_M, Math.sign(s0) * dot(target, a))
  const t = Math.sign(t0) * Math.max(MIN_RECT_SIDE_M, Math.sign(t0) * dot(target, n))

  // Every corner sits at 0 or 1 of the (s0, t0) extent from the opposite corner.
  const next = xy.map((p): LngLat => {
    const rel = sub(p, opposite)
    const fs = dot(rel, a) / s0
    const ft = dot(rel, n) / t0
    return frame.toLngLat(add(opposite, add(scale(a, fs * s), scale(n, ft * t))))
  })
  return refit(next)
}

/**
 * Drags side `edgeIndex` of a rectangle (0..3; side i joins corner i and corner i+1) to
 * `newPoint`: that side moves along its own normal only and the opposite side stays put, so
 * the other three sides keep their position and the result is an exact rectangle. The side
 * never passes the opposite one: the extent keeps at least `MIN_RECT_SIDE_M`.
 *
 * Returns a closed 5-point ring with the corners in their original order. Invalid input
 * comes back as the same array (see `resizeRectCorner`).
 */
export function resizeRectEdge(ring: Ring, edgeIndex: number, newPoint: number[]): Ring {
  const parts = rectCorners(ring)
  if (
    !parts ||
    !Number.isInteger(edgeIndex) ||
    edgeIndex < 0 ||
    edgeIndex > 3 ||
    !allFinite([newPoint]) ||
    !isRectangle(ring, 0.05)
  ) {
    return ring
  }
  const { frame, xy } = parts
  const i = edgeIndex
  const c = (k: number) => xy[(i + k) % 4]

  // Direction along the side, and the normal pointing out of the rectangle through it.
  const along = sub(c(1), c(0))
  const l = length(along)
  if (!(l > 0)) return ring
  const a: XY = [along[0] / l, along[1] / l]
  const perp: XY = [-a[1], a[0]]
  const out = dot(sub(c(0), c(3)), perp) >= 0 ? perp : scale(perp, -1)

  // The opposite side (corners i+3 and i+2) is the anchor.
  const width = dot(sub(c(2), c(3)), a)
  const extent = dot(sub(c(0), c(3)), out)
  if (Math.abs(width) < MIN_RECT_SIDE_M || extent < MIN_RECT_SIDE_M) return ring

  const base = c(3)
  const d = Math.max(MIN_RECT_SIDE_M, dot(sub(frame.toXY(newPoint), base), out))
  const along2 = scale(a, width)
  const moved = scale(out, d)
  const next = xy.slice()
  next[i % 4] = add(base, moved)
  next[(i + 1) % 4] = add(add(base, along2), moved)
  next[(i + 2) % 4] = add(base, along2)
  next[(i + 3) % 4] = base

  return refit(next.map((p): LngLat => frame.toLngLat(p)))
}
