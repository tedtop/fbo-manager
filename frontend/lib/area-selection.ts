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
