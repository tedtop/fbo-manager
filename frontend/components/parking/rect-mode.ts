import type { Ring } from '@/lib/parking-geometry'
import { resizeRectCorner, resizeRectEdge } from '@/lib/rect-geometry'
// @ts-ignore -- @mapbox/mapbox-gl-draw ships no type declarations
import MapboxDraw from '@mapbox/mapbox-gl-draw'

/** Name of the custom Draw mode that edits a rectangle by its handles. */
export const RECT_MODE = 'direct_rect'

type LngLatLike = { lng: number; lat: number }

type Handle = {
  kind: 'corner' | 'edge'
  /** Corner 0..3, or side 0..3 (side i joins corner i and i+1). */
  index: number
  /** The rectangle when the drag started: every move is computed from it. */
  ring: Ring
  /** Pointer and handle position at the start, so the handle does not jump to the pointer. */
  pointer: LngLatLike
  at: [number, number]
}

// biome-ignore lint/suspicious/noExplicitAny: Draw's mode state and context are untyped
type Any = any

/** Where `coord_path` ("0.<n>") of a handle points. */
function pathIndex(path: string): number {
  return Number.parseInt(path.split('.')[1] ?? '', 10)
}

function point(properties: Record<string, unknown>, coordinates: number[]) {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates }
  }
}

/**
 * Draw features for the handles of a rectangle: a `vertex` on each corner and a `midpoint` on
 * each side, with the paths Draw's own vertices use ("0.i" for corner i; a side's midpoint
 * carries the path of the corner that ends it). `ring` is the closed 5-point ring.
 */
export function rectHandleFeatures(featureId: string, ring: number[][]) {
  const corners = ring.slice(0, 4)
  const vertices = corners.map((c, i) =>
    point(
      {
        meta: 'vertex',
        parent: featureId,
        coord_path: `0.${i}`,
        active: 'false',
        rect: 'true'
      },
      c
    )
  )
  const midpoints = corners.map((c, i) => {
    const next = corners[(i + 1) % 4]
    const lng = (c[0] + next[0]) / 2
    const lat = (c[1] + next[1]) / 2
    return point(
      {
        meta: 'midpoint',
        parent: featureId,
        coord_path: `0.${i + 1}`,
        lng,
        lat,
        rect: 'true'
      },
      [lng, lat]
    )
  })
  return [...vertices, ...midpoints]
}

/** The ring after dragging `handle` to where the pointer is now. */
export function resizedRing(handle: Handle, pointer: LngLatLike): Ring {
  const target = [
    handle.at[0] + (pointer.lng - handle.pointer.lng),
    handle.at[1] + (pointer.lat - handle.pointer.lat)
  ]
  return handle.kind === 'corner'
    ? resizeRectCorner(handle.ring, handle.index, target)
    : resizeRectEdge(handle.ring, handle.index, target)
}

const DirectSelect = MapboxDraw.modes.direct_select

/**
 * `direct_select` for a rectangle: four corner handles and four side handles that resize the
 * shape and keep it a rectangle (a corner scales it with the opposite corner fixed, a side
 * moves just that side). Dragging the body still moves the whole shape. A side's handle never
 * adds a corner, which is what sets this apart from `direct_select`. Handles are Draw point
 * features, drawn in screen space, so they follow the map's rotation; the maths runs in the
 * rectangle's own axes (lib/rect-geometry.ts), so any heading works.
 *
 * It reuses Draw's drag plumbing (start, stop, update events) and overrides only what a
 * handle does. `selectedCoordPaths` stays empty, which keeps the body draggable.
 */
export const RectMode = {
  ...DirectSelect,

  onSetup(this: Any, opts: Any) {
    const state = DirectSelect.onSetup.call(this, opts)
    state.handle = null
    return state
  },

  onVertex(this: Any, state: Any, e: Any) {
    this.startDragging(state, e)
    const index = pathIndex(e.featureTarget.properties.coord_path)
    this.beginHandle(state, e, 'corner', index)
  },

  onMidpoint(this: Any, state: Any, e: Any) {
    this.startDragging(state, e)
    // The midpoint's path is the corner that ends the side.
    const index = pathIndex(e.featureTarget.properties.coord_path) - 1
    this.beginHandle(state, e, 'edge', index)
  },

  beginHandle(
    this: Any,
    state: Any,
    e: Any,
    kind: Handle['kind'],
    index: number
  ) {
    const ring: Ring = state.feature.getCoordinates()[0]
    const from = ring[index % 4]
    const to = ring[(index + 1) % 4]
    state.handle = {
      kind,
      index,
      ring,
      pointer: { lng: e.lngLat.lng, lat: e.lngLat.lat },
      at:
        kind === 'corner'
          ? [from[0], from[1]]
          : [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
    } satisfies Handle
  },

  dragFeature(this: Any, state: Any, e: Any, delta: Any) {
    if (!state.handle) {
      DirectSelect.dragFeature.call(this, state, e, delta)
      return
    }
    const next = resizedRing(state.handle, e.lngLat)
    if (next !== state.handle.ring) state.feature.incomingCoords([next])
    state.dragMoveLocation = e.lngLat
  },

  stopDragging(this: Any, state: Any) {
    DirectSelect.stopDragging.call(this, state)
    state.handle = null
  },

  onMouseMove(this: Any, state: Any, e: Any) {
    const result = DirectSelect.onMouseMove.call(this, state, e)
    const meta = e.featureTarget?.properties?.meta
    if (meta === 'vertex' || meta === 'midpoint') {
      this.updateUIClasses({ mouse: MapboxDraw.constants.cursors.MOVE })
    }
    return result
  },

  toDisplayFeatures(
    this: Any,
    state: Any,
    geojson: Any,
    push: (f: unknown) => void
  ) {
    if (state.featureId === geojson.properties.id) {
      geojson.properties.active = MapboxDraw.constants.activeStates.ACTIVE
      push(geojson)
      for (const handle of rectHandleFeatures(
        geojson.properties.id,
        geojson.geometry.coordinates[0]
      )) {
        push(handle)
      }
    } else {
      geojson.properties.active = MapboxDraw.constants.activeStates.INACTIVE
      push(geojson)
    }
    this.fireActionable(state)
  },

  // Delete / Backspace must not remove a corner of a rectangle.
  onTrash() {}
}
