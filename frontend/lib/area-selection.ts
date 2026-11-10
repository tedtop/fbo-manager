import { type LngLat, findAreaAtPoint } from '@/lib/parking-geometry'

export type AreaClickAction =
  | { kind: 'select'; areaId: number }
  | { kind: 'deselect' }
  | { kind: 'keep' }

/**
 * What a click on the empty-or-not map means for the area selection.
 * - On an area polygon: select that area (the smallest one containing the point), unless it
 *   already is the selection.
 * - Outside every polygon: deselect, unless something is selected and the click landed on its
 *   editable shape or one of its handles (`onDrawShape`); a corner handle sits on the outline
 *   and can fall just outside the saved polygon.
 * Callers filter out clicks on plane markers, map controls and menus before asking.
 */
export function resolveAreaClick({
  point,
  areas,
  selectedId,
  onDrawShape
}: {
  point: LngLat
  areas: readonly { id: number; polygon: unknown }[]
  selectedId: number | null
  onDrawShape: boolean
}): AreaClickAction {
  const hit = findAreaAtPoint(point, areas)
  if (hit) {
    return hit.id === selectedId
      ? { kind: 'keep' }
      : { kind: 'select', areaId: hit.id }
  }
  if (selectedId === null || onDrawShape) return { kind: 'keep' }
  return { kind: 'deselect' }
}

/** How long after a shape is finished a map click still belongs to that gesture. */
export const CLICK_SETTLE_MS = 400

/**
 * True when a map click must not change the area selection:
 * - while a polygon is being drawn (`drawing`): clicks place corners;
 * - for a short settle window after drawing finished. MapboxDraw finishes a shape on the
 *   mouseup of the closing click, so the DOM `click` that follows reaches the map click
 *   handler a moment later, while the new shape is not saved yet. It would read as a click
 *   on empty map and deselect the area that was just drawn.
 */
export function isMapClickSuppressed({
  drawing,
  finishedAt,
  now,
  settleMs = CLICK_SETTLE_MS
}: {
  drawing: boolean
  /** Timestamp (ms) when the last drawing finished, or null if none did. */
  finishedAt: number | null
  now: number
  settleMs?: number
}): boolean {
  if (drawing) return true
  return finishedAt !== null && now - finishedAt < settleMs
}
