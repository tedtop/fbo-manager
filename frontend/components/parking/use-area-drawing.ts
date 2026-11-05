'use client'

import {
  type GeoJsonPolygon,
  type Ring,
  isValidRing,
  ringOf,
  squareUpRing,
  toGeoJsonPolygon
} from '@/lib/parking-geometry'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
// @ts-ignore -- @mapbox/mapbox-gl-draw ships no type declarations
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type mapboxgl from 'mapbox-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import {
  type Notice,
  createBoundarySaveQueue,
  escapeBelongsToOthers
} from './draw-support'

export { DRAW_FINISH_HINT, EDIT_HINT, type Notice } from './draw-support'

/**
 * `idle`: no editable shape (no area selected, or the selected area has no boundary yet).
 * `drawing`: `draw_polygon` is collecting corners for the selected area.
 * `editing`: the selected area's boundary is open in `direct_select`: corners, midpoints and
 * the whole shape can be dragged, and every change is saved. There is no button for this
 * mode: selecting an area that has a boundary enters it, deselecting leaves it.
 */
export type DrawMode = 'idle' | 'drawing' | 'editing'

type Options = {
  mapRef: RefObject<mapboxgl.Map | null>
  loaded: boolean
  /** Drawing is only available to admins in config mode. */
  enabled: boolean
  /** The selected area, or null when nothing is selected. */
  area: ParkingAreaRow | null
  /** Persists the area's single polygon, replacing any previous one. Must throw on failure. */
  onSave: (areaId: number, polygon: GeoJsonPolygon) => Promise<void>
  onNotice: (notice: Notice | null) => void
  /** Esc while editing: the parent clears the selection. */
  onDeselect: () => void
}

/**
 * Admin polygon editing on top of MapboxDraw. Exactly one polygon per area.
 *
 * Selection model (the selected area is the only input):
 *   no area / no boundary --idle--> [Draw boundary] --drawing--> double-click --> editing
 *   area with boundary    ---------------------------------------------------> editing
 *   editing --select another area / deselect / boundary cleared--> idle (or editing another)
 *   drawing --Esc / Cancel drawing--> editing (old boundary back) or idle
 * While `editing`, each `draw.update` is validated and saved through a 400 ms debounce, and
 * pending changes are flushed whenever the selection moves on.
 */
export function useAreaDrawing({
  mapRef,
  loaded,
  enabled,
  area,
  onSave,
  onNotice,
  onDeselect
}: Options) {
  const drawRef = useRef<MapboxDraw | null>(null)
  const [drawReady, setDrawReady] = useState(false)
  const [mode, setModeState] = useState<DrawMode>('idle')
  const modeRef = useRef<DrawMode>('idle')
  // The area the current draw session (drawing or editing) belongs to.
  const activeAreaIdRef = useRef<number | null>(null)
  // True while this hook itself drives MapboxDraw, so its modechange events are not user input.
  const internalRef = useRef(false)
  // True from `draw.create` until the finished shape has been handed over: draw_polygon
  // changes mode right after create, which must not look like a cancelled drawing.
  const finishingRef = useRef(false)
  const areaRef = useRef(area)
  const onSaveRef = useRef(onSave)
  const onNoticeRef = useRef(onNotice)
  const onDeselectRef = useRef(onDeselect)
  areaRef.current = area
  onSaveRef.current = onSave
  onNoticeRef.current = onNotice
  onDeselectRef.current = onDeselect

  const [scheduler] = useState(() =>
    createBoundarySaveQueue(
      () => onSaveRef.current,
      () => onNoticeRef.current
    )
  )

  const setMode = useCallback((next: DrawMode) => {
    modeRef.current = next
    setModeState(next)
  }, [])

  const withInternal = useCallback((fn: () => void) => {
    const previous = internalRef.current
    internalRef.current = true
    try {
      fn()
    } finally {
      internalRef.current = previous
    }
  }, [])

  /** Opens `ring` as the editable shape of `areaId`, replacing whatever Draw holds. */
  const showShape = useCallback(
    (ring: Ring, areaId: number) => {
      const draw = drawRef.current
      if (!draw) return
      withInternal(() => {
        draw.deleteAll()
        const [featureId] = draw.add({
          type: 'Feature',
          properties: {},
          geometry: toGeoJsonPolygon(ring)
        })
        activeAreaIdRef.current = areaId
        setMode('editing')
        draw.changeMode('direct_select', { featureId })
      })
    },
    [setMode, withInternal]
  )

  /** Removes every Draw feature; nothing is editable afterwards. */
  const clearShape = useCallback(() => {
    const draw = drawRef.current
    if (draw) {
      withInternal(() => {
        draw.deleteAll()
        draw.changeMode('simple_select')
      })
    }
    activeAreaIdRef.current = null
    setMode('idle')
  }, [setMode, withInternal])

  /** After an abandoned drawing: back to the area's saved boundary, if it has one. */
  const restoreSavedShape = useCallback(() => {
    const target = areaRef.current
    const ring = ringOf(target?.polygon)
    if (target && ring) showShape(ring, target.id)
    else clearShape()
  }, [showShape, clearShape])

  // Install the draw control while config mode is on.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !enabled) return

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: 'simple_select'
    })
    map.addControl(draw)
    drawRef.current = draw
    setDrawReady(true)

    type DrawEvent = {
      features: Array<{ geometry?: { coordinates?: unknown } }>
    }
    const ringOfEvent = (e: DrawEvent): unknown =>
      (e.features[0]?.geometry?.coordinates as number[][][] | undefined)?.[0]

    const notInvalid = () =>
      onNoticeRef.current({
        kind: 'error',
        text: 'That shape is not valid (it needs at least 3 corners). Nothing was saved.'
      })

    const queueSave = (ring: Ring, areaId: number, message: string) => {
      const target = areaRef.current
      const code = target?.id === areaId ? target.code : `#${areaId}`
      scheduler.schedule({
        areaId,
        code,
        ring,
        message: message.replace('{code}', code)
      })
    }

    const handleCreate = async (e: DrawEvent) => {
      finishingRef.current = true
      // draw.create fires inside draw_polygon's stop(), before the mode switch completes.
      await Promise.resolve()
      try {
        const target = areaRef.current
        const ring = ringOfEvent(e)
        if (!target) {
          clearShape()
        } else if (!isValidRing(ring)) {
          notInvalid()
          restoreSavedShape()
        } else {
          // The new shape stays open for editing; the saved copy arrives with the next fetch.
          showShape(ring, target.id)
          queueSave(ring, target.id, 'Boundary for {code} saved.')
          await scheduler.flush()
        }
      } finally {
        finishingRef.current = false
      }
    }

    const handleUpdate = (e: DrawEvent) => {
      const areaId = activeAreaIdRef.current
      if (areaId === null) return
      const ring = ringOfEvent(e)
      if (!isValidRing(ring)) {
        notInvalid()
        return
      }
      queueSave(ring, areaId, 'Boundary for {code} saved.')
    }

    const handleModeChange = (e: { mode: string }) => {
      if (internalRef.current || finishingRef.current) return
      // Anything else Draw does on its own while editing (a click beside the shape drops its
      // selection) is settled by the map click handler, which deselects or reselects.
      if (modeRef.current === 'drawing' && e.mode === 'simple_select') {
        onNoticeRef.current({ kind: 'info', text: 'Drawing cancelled.' })
        queueMicrotask(restoreSavedShape)
      }
    }

    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)
    map.on('draw.modechange', handleModeChange)

    return () => {
      map.off('draw.create', handleCreate)
      map.off('draw.update', handleUpdate)
      map.off('draw.modechange', handleModeChange)
      // Changes still waiting for the debounce are written now.
      void scheduler.flush()
      // The map may already be gone when the whole page unmounts.
      if (mapRef.current === map) map.removeControl(draw)
      drawRef.current = null
      activeAreaIdRef.current = null
      setDrawReady(false)
      modeRef.current = 'idle'
      setModeState('idle')
    }
  }, [
    mapRef,
    loaded,
    enabled,
    scheduler,
    showShape,
    clearShape,
    restoreSavedShape
  ])

  // The selection drives the editable shape.
  const areaId = area?.id ?? null
  const hasBoundary = ringOf(area?.polygon) !== null
  useEffect(() => {
    if (!drawReady) return
    if (modeRef.current !== 'idle' && activeAreaIdRef.current === areaId) {
      // Same area: only a cleared boundary changes anything.
      if (modeRef.current === 'editing' && !hasBoundary) clearShape()
      return
    }
    // Edits made on the previous area are written before the new one opens.
    void scheduler.flush()
    const ring = ringOf(areaRef.current?.polygon)
    if (areaId !== null && ring) showShape(ring, areaId)
    else clearShape()
  }, [drawReady, areaId, hasBoundary, scheduler, showShape, clearShape])

  const startDraw = useCallback(() => {
    const draw = drawRef.current
    const target = areaRef.current
    if (!draw || !target) return
    void scheduler.flush()
    withInternal(() => {
      draw.deleteAll()
      draw.changeMode('draw_polygon')
    })
    activeAreaIdRef.current = target.id
    setMode('drawing')
    // The persistent hint (map pill and panel) replaces any transient message.
    onNoticeRef.current(null)
  }, [scheduler, setMode, withInternal])

  const cancelDraw = useCallback(() => {
    if (modeRef.current !== 'drawing') return
    restoreSavedShape()
    onNoticeRef.current({ kind: 'info', text: 'Drawing cancelled.' })
  }, [restoreSavedShape])

  /** Squares the shape up to the map as currently seen (`bearing`) and saves it. */
  const snapToGrid = useCallback(
    (bearing: number) => {
      const draw = drawRef.current
      const target = areaRef.current
      if (!draw || !target || modeRef.current === 'drawing') return
      // The editable copy is the freshest shape: it may hold changes not saved yet.
      const live =
        modeRef.current === 'editing'
          ? (
              draw.getAll().features[0]?.geometry?.coordinates as
                | number[][][]
                | undefined
            )?.[0]
          : undefined
      const current = ringOf(live) ?? ringOf(target.polygon)
      if (!current) return
      const snapped = squareUpRing(current, bearing)
      if (snapped === current) {
        onNoticeRef.current({
          kind: 'error',
          text: `The shape of ${target.code} is too small to square up.`
        })
        return
      }
      showShape(snapped, target.id)
      scheduler.schedule({
        areaId: target.id,
        code: target.code,
        ring: snapped,
        message: 'Snapped to grid'
      })
      void scheduler.flush()
    },
    [scheduler, showShape]
  )

  /** Writes any change still waiting for the debounce. */
  const flushPending = useCallback(() => scheduler.flush(), [scheduler])

  // Esc: cancel a drawing, or deselect while editing.
  useEffect(() => {
    if (!drawReady) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escapeBelongsToOthers(e.target)) return
      if (modeRef.current === 'drawing') cancelDraw()
      else if (modeRef.current === 'editing') onDeselectRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawReady, cancelDraw])

  return { mode, startDraw, cancelDraw, snapToGrid, flushPending }
}
