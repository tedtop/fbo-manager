import { describe, expect, it } from 'vitest'
import { RECT_MODE, RectMode, rectHandleFeatures } from '../rect-mode'

const M = 111_320
const CENTRE = [-114.05, 46.95]
const SCALE = Math.cos((CENTRE[1] * Math.PI) / 180) * M
const at = (x: number, y: number) => [CENTRE[0] + x / SCALE, CENTRE[1] + y / M]

// 40 x 20 m, first side heading 40 degrees from east.
const rad = (40 * Math.PI) / 180
const turn = ([x, y]: number[]) => [
  x * Math.cos(rad) - y * Math.sin(rad),
  x * Math.sin(rad) + y * Math.cos(rad)
]
const corners = [
  [-20, -10],
  [20, -10],
  [20, 10],
  [-20, 10]
].map((p) => at(...(turn(p) as [number, number])))
const ring = [...corners, corners[0]]

/** A stand-in for Draw's mode object: the RectMode methods plus a fake feature. */
function fakeMode() {
  const feature = {
    coordinates: [ring.slice(0, 4)] as number[][][],
    getCoordinates() {
      return this.coordinates.map((r) => [...r, r[0]])
    },
    incomingCoords(coords: number[][][]) {
      this.coordinates = coords.map((r) => r.slice(0, -1))
    }
  }
  const mode = {
    ...RectMode,
    getSelected: () => [],
    startDragging(state: { canDragMove?: boolean }) {
      state.canDragMove = true
    },
    stopDragging(state: { canDragMove?: boolean; handle?: unknown }) {
      state.canDragMove = false
      state.handle = null
    }
  }
  const state: {
    feature: typeof feature
    handle: unknown
    dragMoveLocation: unknown
  } = { feature, handle: null, dragMoveLocation: null }
  return { mode, state, feature }
}

const targetAt = (path: string, lngLat: number[]) => ({
  featureTarget: { properties: { coord_path: path } },
  lngLat: { lng: lngLat[0], lat: lngLat[1] }
})

describe('rectHandleFeatures', () => {
  const features = rectHandleFeatures('f1', ring)

  it('has a corner handle (vertex) on each corner and a side handle (midpoint) on each side', () => {
    const vertices = features.filter((f) => f.properties.meta === 'vertex')
    const midpoints = features.filter((f) => f.properties.meta === 'midpoint')
    expect(vertices.map((f) => f.properties.coord_path)).toEqual([
      '0.0',
      '0.1',
      '0.2',
      '0.3'
    ])
    expect(vertices.map((f) => f.geometry.coordinates)).toEqual(corners)
    // A side's midpoint carries the path of the corner that ends it, like Draw's own midpoints.
    expect(midpoints.map((f) => f.properties.coord_path)).toEqual([
      '0.1',
      '0.2',
      '0.3',
      '0.4'
    ])
    expect(midpoints[0].geometry.coordinates[0]).toBeCloseTo(
      (corners[0][0] + corners[1][0]) / 2,
      12
    )
    expect(midpoints[3].geometry.coordinates[1]).toBeCloseTo(
      (corners[3][1] + corners[0][1]) / 2,
      12
    )
  })

  it('marks them for the rectangle style and points them at their shape', () => {
    for (const f of features) {
      expect(f.properties.parent).toBe('f1')
      expect(f.properties.rect).toBe('true')
    }
  })
})

describe('RectMode', () => {
  it('is registered under its own name and keeps direct_select behaviour for the rest', () => {
    expect(RECT_MODE).toBe('direct_rect')
    expect(RectMode.onSetup).toBeTypeOf('function')
    expect(RectMode.onDrag).toBeTypeOf('function')
    expect(RectMode.onMouseUp).toBeTypeOf('function')
  })

  it('a corner drag keeps a rectangle and the opposite corner; no corner is added', () => {
    const { mode, state, feature } = fakeMode()
    mode.onVertex(state, targetAt('0.2', corners[2]))
    const drag = at(...(turn([40, 25]) as [number, number]))
    mode.dragFeature(state, { lngLat: { lng: drag[0], lat: drag[1] } }, {})
    expect(feature.coordinates[0]).toHaveLength(4)
    expect(feature.coordinates[0][0][0]).toBeCloseTo(corners[0][0], 9)
    expect(feature.coordinates[0][0][1]).toBeCloseTo(corners[0][1], 9)
    expect(feature.coordinates[0][2]).not.toEqual(corners[2])
  })

  it('a side drag moves that side only and never adds a corner', () => {
    const { mode, state, feature } = fakeMode()
    const mid = [
      (corners[1][0] + corners[2][0]) / 2,
      (corners[1][1] + corners[2][1]) / 2
    ]
    // The path of a midpoint is the corner that ends the side: side 1 (corner 1 to 2) is "0.2".
    mode.onMidpoint(state, targetAt('0.2', mid))
    const pointer = at(...(turn([32, 0]) as [number, number]))
    mode.dragFeature(
      state,
      { lngLat: { lng: pointer[0], lat: pointer[1] } },
      {}
    )
    expect(feature.coordinates[0]).toHaveLength(4)
    // Sides 3 (corner 3 to 0) and the corners 0 and 3 stay.
    expect(feature.coordinates[0][0][0]).toBeCloseTo(corners[0][0], 9)
    expect(feature.coordinates[0][3][1]).toBeCloseTo(corners[3][1], 9)
    // The moved side went outwards by 12 m along its normal (the pointer is 12 m past it).
    const moved = feature.coordinates[0][1]
    const dx = (moved[0] - corners[1][0]) * SCALE
    const dy = (moved[1] - corners[1][1]) * M
    expect(Math.hypot(dx, dy)).toBeCloseTo(12, 3)
  })

  it('without a handle a drag is direct_select moving the whole shape', () => {
    const { mode, state, feature } = fakeMode()
    const before = feature.coordinates
    const lngLat = { lng: -114, lat: 47 }
    mode.dragFeature(state, { lngLat }, { lng: 0, lat: 0 })
    // direct_select's dragFeature ran (no resize): it records where the pointer is now.
    expect(state.dragMoveLocation).toBe(lngLat)
    expect(feature.coordinates).toBe(before)
  })

  it('drag end clears the handle', () => {
    const { mode, state } = fakeMode()
    mode.onVertex(state, targetAt('0.0', corners[0]))
    expect(state.handle).not.toBe(null)
    mode.stopDragging(state)
    expect(state.handle).toBe(null)
  })
})
