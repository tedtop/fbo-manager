import {
  type GeoJsonPolygon,
  type Ring,
  toGeoJsonPolygon
} from '@/lib/parking-geometry'
import { createSaveScheduler } from '@/lib/save-scheduler'

export type Notice = { kind: 'info' | 'success' | 'error'; text: string }

export const DRAW_FINISH_HINT = 'Double-click to finish shape · Esc to cancel'
export const EDIT_HINT =
  'Drag a corner to move it, a midpoint to add a corner, or the shape to move it all. Changes save automatically. Esc or a click on empty map to deselect.'

const SAVE_DELAY_MS = 400

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
  save: () => (areaId: number, polygon: GeoJsonPolygon) => Promise<void>,
  notify: () => (notice: Notice) => void
) {
  return createSaveScheduler<SaveJob>({
    delayMs: SAVE_DELAY_MS,
    save: async (job) => {
      try {
        await save()(job.areaId, toGeoJsonPolygon(job.ring))
        notify()({ kind: 'success', text: job.message })
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
