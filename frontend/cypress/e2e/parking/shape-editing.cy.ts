import { taskUntil } from '../../support/task-poll'

// Cypress spec (B100): square up and resize parking areas on the real /parking map, in config mode, with real pointer
// events on the map canvas, on a map that is rotated 40 degrees (the app's default bearing). Every check ends in a direct
// DB read of parking_area.polygon: the saved ring must be an exact rectangle, computed here, independent of the app code.
//
// The map instance comes from window.__parkingMap, a seam use-map-instance.ts sets only when window.Cypress exists.
const stamp = Date.now().toString(36).toUpperCase()
const codes = {
  squareUp: `CYB100A${stamp}`,
  resize: `CYB100B${stamp}`,
  free: `CYB100C${stamp}`,
  snap: `CYB100D${stamp}`
}

const M = 111_320
const CENTRE: [number, number] = [-114.08587471583614, 46.92183963008256]

type Metric = [number, number]
type Ring = number[][]

/** Closed ring from metric corners (east, north) around the map's default centre. */
const ringFromMetres = (corners: Metric[]): Ring => {
  const scale = Math.cos((CENTRE[1] * Math.PI) / 180) * M
  const pts = corners.map(([x, y]) => [CENTRE[0] + x / scale, CENTRE[1] + y / M])
  return [...pts, pts[0]]
}

/** A w x h rectangle whose first side points `deg` degrees counter-clockwise from east. */
const rectangleRing = (w: number, h: number, deg: number): Ring => {
  const rad = (deg * Math.PI) / 180
  const u: Metric = [Math.cos(rad), Math.sin(rad)]
  const v: Metric = [-u[1], u[0]]
  const at = (a: number, b: number): Metric => [u[0] * a + v[0] * b, u[1] * a + v[1] * b]
  return ringFromMetres([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)])
}

/** Metres (east, north) of ring points around the ring's own average. */
const toMetric = (points: Ring, around: Ring = points): Metric[] => {
  const mean = [0, 1].map((k) => around.slice(0, 4).reduce((s, p) => s + p[k], 0) / 4)
  const scale = Math.cos((mean[1] * Math.PI) / 180) * M
  return points.map((p): Metric => [(p[0] - mean[0]) * scale, (p[1] - mean[1]) * M])
}

const distance = (a: number[], b: number[]): number => {
  const [pa, pb] = toMetric([a, b], [a, b, a, b])
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
}

/** Compass heading (0..360) of the way from a to b. */
const heading = (a: number[], b: number[]): number => {
  const [pa, pb] = toMetric([a, b], [a, b, a, b])
  return ((Math.atan2(pb[0] - pa[0], pb[1] - pa[1]) * 180) / Math.PI + 360) % 360
}

/** Smallest distance between two angles that are only equal modulo `period` degrees. */
const angleGap = (a: number, b: number, period: number): number => {
  const d = (((a - b) % period) + period) % period
  return Math.min(d, period - d)
}

/** The saved ring is a closed 5-point rectangle: opposite sides equal, adjacent sides perpendicular, to 0.1 mm. */
function expectExactRectangle(ring: Ring | null): asserts ring is Ring {
  expect(ring, 'saved ring').to.not.eq(null)
  expect(ring, 'closed 5-point ring').to.have.length(5)
  expect(ring![4]).to.deep.eq(ring![0])
  const [p0, p1, p2, p3] = toMetric(ring!.slice(0, 4))
  const skew = Math.hypot(p0[0] + p2[0] - p1[0] - p3[0], p0[1] + p2[1] - p1[1] - p3[1])
  const e0: Metric = [p1[0] - p0[0], p1[1] - p0[1]]
  const e1: Metric = [p2[0] - p1[0], p2[1] - p1[1]]
  const normal = Math.abs(e0[0] * e1[0] + e0[1] * e1[1]) / Math.hypot(...e0)
  expect(skew, 'opposite sides equal and parallel (m)').to.be.lessThan(1e-4)
  expect(normal, 'adjacent sides perpendicular (m)').to.be.lessThan(1e-4)
  expect(Math.hypot(...e0), 'side length (m)').to.be.greaterThan(1)
  expect(Math.hypot(...e1), 'side length (m)').to.be.greaterThan(1)
}

const area = (ring: Ring): number => distance(ring[0], ring[1]) * distance(ring[1], ring[2])

const sub = (a: Metric, b: Metric): Metric => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Metric, b: Metric): number => a[0] * b[0] + a[1] * b[1]
const unit = (a: Metric): Metric => [a[0] / Math.hypot(...a), a[1] / Math.hypot(...a)]

type MapLike = {
  project(lngLat: number[]): { x: number; y: number }
  unproject(point: number[]): { lng: number; lat: number }
  isMoving(): boolean
  getBearing(): number
  queryRenderedFeatures(point: number[]): Array<{ properties?: { meta?: string } }>
}
const mapOf = (win: Cypress.AUTWindow): MapLike => (win as unknown as { __parkingMap: MapLike }).__parkingMap

const savedRing = (code: string) => taskUntil<Ring | null>('getParkingAreaRing', code, (ring) => expect(ring).to.not.eq(null))

/**
 * Seeds an area, opens /parking in config mode, selects it and turns the map to `bearing` with the rotation slider.
 * Selecting flies the map to the shape (and resets it to north up); the shape is only editable once the map has
 * settled and the panel shows the editing hint, so the helper waits for both.
 */
function openArea(code: string, ring: Ring, bearing = 40) {
  cy.task('seedParkingArea', { code, name: `B100 ${code}`, ring })
  cy.visit('/parking')
  cy.get('#config-mode').click()
  cy.contains('li', code).find('button[aria-pressed]').click()
  cy.contains('p', `Boundary for ${code}`).should('be.visible')
  cy.contains('p', 'Changes save automatically').should('be.visible')
  cy.window().should((win) => expect(mapOf(win).isMoving(), 'map has settled').to.eq(false))
  // The slider is a controlled React input: set the value through the native setter, then fire the input event.
  cy.get('#map-rotation').then(($slider) => {
    const input = $slider[0] as HTMLInputElement
    const win = input.ownerDocument.defaultView as Window & typeof globalThis
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, String(bearing))
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
  })
  cy.window().should((win) => expect(mapOf(win).getBearing(), 'map rotation').to.be.closeTo(bearing, 0.5))
}

/**
 * Drags a handle (Draw vertex = corner, midpoint = side) at a lng/lat by a screen vector, once the map is still and the
 * handle is drawn there. Yields the lng/lat the pointer ended on.
 */
function dragHandle(kind: 'vertex' | 'midpoint', lngLat: number[], dx: number, dy: number): Cypress.Chainable<number[]> {
  cy.window().should((win) => {
    const map = mapOf(win)
    expect(map.isMoving(), 'map has settled').to.eq(false)
    const p = map.project(lngLat)
    const drawn = map.queryRenderedFeatures([p.x, p.y]).some((f) => f.properties?.meta === kind)
    expect(drawn, `${kind} handle drawn at the point`).to.eq(true)
  })
  return cy.window().then((win) => {
    const from = mapOf(win).project(lngLat)
    const canvas = () => cy.get('canvas.maplibregl-canvas')
    // MapLibre only reacts to real MouseEvents; cy.trigger sends a plain Event unless told otherwise.
    const mouse = { force: true, eventConstructor: 'MouseEvent' }
    canvas().trigger('mousedown', from.x, from.y, { ...mouse, button: 0, buttons: 1 })
    const steps = 6
    for (let i = 1; i <= steps; i++) {
      canvas().trigger('mousemove', from.x + (dx * i) / steps, from.y + (dy * i) / steps, { ...mouse, buttons: 1 })
    }
    canvas().trigger('mouseup', from.x + dx, from.y + dy, { ...mouse, button: 0, buttons: 0 })
    const end = mapOf(win).unproject([from.x + dx, from.y + dy])
    cy.wrap([end.lng, end.lat], { log: false })
  })
}

const midpoint = (a: number[], b: number[]): number[] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

describe('Parking areas: square up and resize shapes (B100)', () => {
  beforeEach(() => {
    cy.login()
  })

  after(() => {
    cy.task('cleanParkingAreas', Object.values(codes))
  })

  it('Make rectangle squares an irregular shape in one click and keeps its own direction', () => {
    // A skewed quad, turned 20 degrees: nothing like the map's axes.
    const rad = (20 * Math.PI) / 180
    const quad: Metric[] = [
      [-35, -12],
      [32, -18],
      [38, 14],
      [-28, 20]
    ]
    const seed = ringFromMetres(
      quad.map(([x, y]): Metric => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)])
    )
    openArea(codes.squareUp, seed)
    // Not a rectangle: free editing, so the rectangle handles toggle is not offered.
    cy.contains('button', 'Keep rectangular').should('not.exist')
    cy.contains('button', 'Edit freely').should('not.exist')

    cy.contains('button', 'Make rectangle').click()

    // One action, one saved rectangle...
    taskUntil<Ring | null>('getParkingAreaRing', codes.squareUp, (ring) => {
      expectExactRectangle(ring)
      // ...that contains every original corner (the smallest one around the shape)...
      const mine = toMetric(ring.slice(0, 4))
      const [p0, p1, , p3] = mine
      const e0: Metric = [p1[0] - p0[0], p1[1] - p0[1]]
      const e1: Metric = [p3[0] - p0[0], p3[1] - p0[1]]
      for (const corner of toMetric(seed.slice(0, 4), ring)) {
        const d: Metric = [corner[0] - p0[0], corner[1] - p0[1]]
        const s = (d[0] * e0[0] + d[1] * e0[1]) / Math.hypot(...e0)
        const t = (d[0] * e1[0] + d[1] * e1[1]) / Math.hypot(...e1)
        expect(s).to.be.within(-1e-3, Math.hypot(...e0) + 1e-3)
        expect(t).to.be.within(-1e-3, Math.hypot(...e1) + 1e-3)
      }
      // ...and keeps the shape's own direction: a side runs along one of the original sides (modulo 180 degrees).
      const own = [0, 1, 2, 3].map((i) => heading(seed[i], seed[i + 1]))
      expect(Math.min(...own.map((h) => angleGap(h, heading(ring[0], ring[1]), 180)))).to.be.lessThan(0.01)
    })
    // The rectangle handles are on now: the way back to plain corners is offered.
    cy.contains('button', 'Edit freely').should('be.visible')
  })

  it('a corner handle scales the rectangle from the opposite corner, a side handle moves just that side', () => {
    // 25 degrees: neither the map's axes (bearing 40) nor the screen's.
    openArea(codes.resize, rectangleRing(60, 30, 25))
    cy.contains('button', 'Edit freely').should('be.visible')

    savedRing(codes.resize).then((before) => {
      // Corner 2 dragged by an arbitrary screen vector (the map is at 40 degrees, the shape at 25).
      dragHandle('vertex', before![2], 55, 35).then((target) => {
        // Expected: the pointer projected onto the rectangle's own axes, measured from the opposite corner.
        const [opp, c1, c3, pointer] = toMetric([before![0], before![1], before![3], target], before!)
        const a = unit(sub(c1, opp))
        const n = unit(sub(c3, opp))
        const rel = sub(pointer, opp)
        const expected: Metric = [opp[0] + a[0] * dot(rel, a) + n[0] * dot(rel, n), opp[1] + a[1] * dot(rel, a) + n[1] * dot(rel, n)]
        taskUntil<Ring | null>('getParkingAreaRing', codes.resize, (after) => {
          expectExactRectangle(after)
          expect(distance(after[0], before![0]), 'opposite corner stays').to.be.lessThan(1e-3)
          const [moved] = toMetric([after[2]], before!)
          expect(Math.hypot(...sub(moved, expected)), 'corner is where the pointer projects to (m)').to.be.lessThan(0.02)
          expect(Math.abs(area(after) - area(before!)), 'size changed').to.be.greaterThan(5)
          // Same direction as before.
          expect(angleGap(heading(after[0], after[1]), heading(before![0], before![1]), 180)).to.be.lessThan(0.01)
        })
      })
    })

    savedRing(codes.resize).then((before) => {
      // Side 0 (corner 0 to corner 1) dragged sideways and outwards: only the part along its normal counts.
      dragHandle('midpoint', midpoint(before![0], before![1]), -20, 45).then((target) => {
        const [c0, c1, c2, c3, pointer] = toMetric([...before!.slice(0, 4), target], before!)
        const along = unit(sub(c1, c0))
        const out = unit(sub(c0, c3))
        // The moved side ends up where the pointer is along the normal, measured from the opposite side.
        const extent = dot(sub(pointer, c3), out)
        expect(Math.abs(dot(out, along)), 'normal is perpendicular').to.be.lessThan(1e-6)
        taskUntil<Ring | null>('getParkingAreaRing', codes.resize, (after) => {
          expectExactRectangle(after)
          expect(distance(after[2], before![2]), 'far corner stays').to.be.lessThan(1e-3)
          expect(distance(after[3], before![3]), 'far corner stays').to.be.lessThan(1e-3)
          expect(distance(after[0], after[1]), 'moved side keeps its length').to.be.closeTo(distance(before![0], before![1]), 1e-3)
          expect(distance(after[0], after[3]), 'distance to the far side').to.be.closeTo(extent, 0.02)
          expect(dot(sub(c2, c3), along)).to.be.greaterThan(0)
        })
      })
    })
  })

  it('Edit freely keeps normal polygon editing: a midpoint adds a corner, Make rectangle comes back', () => {
    openArea(codes.free, rectangleRing(50, 25, 130))
    cy.contains('button', 'Edit freely').click()
    cy.contains('button', 'Keep rectangular').should('be.visible')
    cy.contains('button', 'Edit freely').should('not.exist')

    savedRing(codes.free).then((before) => {
      dragHandle('midpoint', midpoint(before![0], before![1]), 20, 40)
      taskUntil<Ring | null>('getParkingAreaRing', codes.free, (after) => {
        expect(after, 'saved ring').to.not.eq(null)
        // 5 corners plus the closing point: the midpoint became a corner, so it is a free polygon now.
        expect(after).to.have.length(6)
        expect(after![5]).to.deep.eq(after![0])
      })
    })
    // No longer a rectangle: no way back to the handles until it is squared up again.
    cy.contains('button', 'Keep rectangular').should('not.exist')

    cy.contains('button', 'Make rectangle').click()
    taskUntil<Ring | null>('getParkingAreaRing', codes.free, (ring) => expectExactRectangle(ring))
    cy.contains('button', 'Edit freely').should('be.visible')
  })

  it('Snap to grid still squares the shape up to the map as you see it', () => {
    const quad: Metric[] = [
      [-30, -10],
      [28, -16],
      [34, 12],
      [-24, 18]
    ]
    openArea(codes.snap, ringFromMetres(quad))
    cy.contains('button', 'Snap to grid').click()
    cy.window().then((win) => {
      const bearing = mapOf(win).getBearing()
      taskUntil<Ring | null>('getParkingAreaRing', codes.snap, (ring) => {
        expectExactRectangle(ring)
        // Sides run along the map's up direction (its bearing) and across it.
        expect(angleGap(heading(ring[0], ring[1]), bearing, 90)).to.be.lessThan(0.01)
      })
    })
  })
})
