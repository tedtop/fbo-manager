import {
  type GeoJsonPolygon,
  type Ring,
  toGeoJsonPolygon
} from '@/lib/parking-geometry'
import { createSaveScheduler } from '@/lib/save-scheduler'
// @ts-ignore -- @mapbox/mapbox-gl-draw ships no type declarations
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import { DRAW_STYLES } from './draw-styles'
import { RECT_MODE, RectMode } from './rect-mode'

export type Notice = {
  kind: 'info' | 'success' | 'error'
  text: string
  /** Shown as a Retry button on the toast. */
  retry?: () => void
}

export const RECOMPUTE_FAILED_SAVE = (retry: () => void): Notice => ({
  kind: 'error',
  text: 'Boundary saved; plane areas could not be updated',
  retry
})
export const RECOMPUTE_FAILED_ARCHIVE = (retry: () => void): Notice => ({
  kind: 'error',
  text: 'Area archived; plane areas could not be updated',
  retry
})

export const DRAW_FINISH_HINT = 'Double-click to finish shape · Esc to cancel'
/** Free polygon editing (any shape). */
export const EDIT_HINT =
  'Drag a corner to move it, a midpoint to add a corner, or the shape to move it all. Changes save automatically. Esc or a click on empty map to deselect.'
/** Rectangle editing: the shape stays a rectangle. */
export const RECT_EDIT_HINT =
  'Drag a corner to resize the rectangle from the opposite corner, a side handle to move just that side, or the shape to move it all. Changes save automatically. Esc or a click on empty map to deselect.'

const SAVE_DELAY_MS = 400

/**
 * MapboxDraw hard-codes Mapbox's DOM class names. MapLibre uses `maplibregl-*`, and Draw
 * needs them for its control container and to recognise the map canvas (it ignores key
 * presses whose target is not the canvas, which would break Enter / Esc). The constants are
 * module-level, so this runs once, before the first MapboxDraw is constructed.
 */
export function applyMapLibreClassNames(): void {
  const classes = MapboxDraw.constants.classes
  classes.CANVAS = 'maplibregl-canvas'
  classes.CONTROL_BASE = 'maplibregl-ctrl'
  classes.CONTROL_PREFIX = 'maplibregl-ctrl-'
  classes.CONTROL_GROUP = 'maplibregl-ctrl-group'
  classes.ATTRIBUTION = 'maplibregl-ctrl-attrib'
}

/** A Draw control (no toolbar; the app drives its modes) styled for MapLibre. */
export function createDrawControl(): MapboxDraw {
  applyMapLibreClassNames()
  return new MapboxDraw({
    displayControlsDefault: false,
    defaultMode: 'simple_select',
    modes: { ...MapboxDraw.modes, [RECT_MODE]: RectMode },
    styles: DRAW_STYLES
  })
}

/** The map seen as the source of Draw's `draw.*` events, which MapLibre's event types omit. */
export type DrawEventSource = {
  on(type: string, listener: (event: never) => void): unknown
  off(type: string, listener: (event: never) => void): unknown
}

export type SaveJob = {
  areaId: number
  code: string
  ring: Ring
  message: string
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Unknown error'
}

/**
 * Debounced boundary saves. The latest drag wins, saves never overlap, and the outcome of
 * each one becomes a notice (the inline error banner on failure).
 */
export function createBoundarySaveQueue(
  save: () => (
    areaId: number,
    polygon: GeoJsonPolygon
  ) => Promise<{ recomputeFailed: boolean }>,
  notify: () => (notice: Notice) => void,
  retryRecompute: () => () => void
) {
  return createSaveScheduler<SaveJob>({
    delayMs: SAVE_DELAY_MS,
    save: async (job) => {
      try {
        const { recomputeFailed } = await save()(job.areaId, toGeoJsonPolygon(job.ring))
        if (recomputeFailed) notify()(RECOMPUTE_FAILED_SAVE(retryRecompute()))
        else notify()({ kind: 'success', text: job.message })
      } catch (err) {
        notify()({
          kind: 'error',
          text: `Could not save the boundary for ${job.code}: ${messageOf(err)}`
        })
      }
    }
  })
}

/** True for keys typed into a text field or pressed inside a dialog, where Esc is not ours. */
export function escapeBelongsToOthers(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[role="dialog"], [role="alertdialog"]')) return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('textarea, select, input:not([type="range"])'))
}
