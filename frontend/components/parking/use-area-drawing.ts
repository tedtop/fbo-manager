'use client'

import { isMapClickSuppressed } from '@/lib/area-selection'
import {
  type GeoJsonPolygon,
  type Ring,
  isValidRing,
  ringOf,
  squareUpRing,
  toGeoJsonPolygon
} from '@/lib/parking-geometry'
import { isRectangle, rectangularizeRing } from '@/lib/rect-geometry'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import './draw-cursors.css'
import {
  type DrawEventSource,
  type Notice,
  createBoundarySaveQueue,
  createDrawControl,
  escapeBelongsToOthers
} from './draw-support'
import { RECT_MODE } from './rect-mode'

export {
  DRAW_FINISH_HINT,
  EDIT_HINT,
  RECT_EDIT_HINT,
  type Notice
} from './draw-support'

/**
 * `idle`: no editable shape (no area selected, or the selected area has no boundary yet).
 * `drawing`: `draw_polygon` is collecting corners for the selected area.
 * `editing`: the selected area's boundary is open for editing and every change is saved.
 * A rectangle opens in the custom `direct_rect` mode (corner and side handles that keep it a
 * rectangle, rect-mode.ts), any other shape in Draw's `direct_select` (drag corners, drag
 * midpoints to add corners); both can drag the whole shape. A rectangle can be switched to
 * free editing and back (`setFreeEditing`). There is no button for `editing` itself:
 * selecting an area that has a boundary enters it, deselecting leaves it.
 */
export type DrawMode = 'idle' | 'drawing' | 'editing'

/** What the open shape is and how it is being edited (only meaningful while `editing`). */
export type ShapeState = {
  /** The shape is a rectangle right now (a free edit can make or break that). */
  rectangular: boolean
  /** Editing with plain polygon handles; false means the rectangle handles. */
  free: boolean
}

type Options = {
  mapRef: RefObject<MapLibreMap | null>
  loaded: boolean
  /** Drawing is only available to admins in config mode. */
  enabled: boolean
  /** The selected area, or null when nothing is selected. */
  area: ParkingAreaRow | null
  /** Persists the area's single polygon, replacing any previous one. Must throw on failure. */
  onSave: (
    areaId: number,
    polygon: GeoJsonPolygon
  ) => Promise<{ recomputeFailed: boolean }>
  /** Re-runs only the plane-area recompute after a save whose recompute failed. */
  onRetryRecompute: () => void
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
  onRetryRecompute,
  onNotice,
  onDeselect
}: Options) {
  const drawRef = useRef<ReturnType<typeof createDrawControl> | null>(null)
  const [drawReady, setDrawReady] = useState(false)
  const [mode, setModeState] = useState<DrawMode>('idle')
  const modeRef = useRef<DrawMode>('idle')
  const [shape, setShape] = useState<ShapeState>({
    rectangular: false,
    free: true
  })
  // The area the current draw session (drawing or editing) belongs to.
  const activeAreaIdRef = useRef<number | null>(null)
  // True while this hook itself drives MapboxDraw, so its modechange events are not user input.
  const internalRef = useRef(false)
  // True from `draw.create` until the finished shape has been handed over: draw_polygon
  // changes mode right after create, which must not look like a cancelled drawing.
  const finishingRef = useRef(false)
  // When the last drawing finished (see isClickSuppressed).
  const finishedAtRef = useRef<number | null>(null)
  const areaRef = useRef(area)
  const onSaveRef = useRef(onSave)
  const onRetryRef = useRef(onRetryRecompute)
  const onNoticeRef = useRef(onNotice)
  const onDeselectRef = useRef(onDeselect)
  areaRef.current = area
  onSaveRef.current = onSave
  onRetryRef.current = onRetryRecompute
  onNoticeRef.current = onNotice
  onDeselectRef.current = onDeselect

  const [scheduler] = useState(() =>
    createBoundarySaveQueue(
      () => onSaveRef.current,
      () => onNoticeRef.current,
      () => onRetryRef.current
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

  /**
   * Opens `ring` as the editable shape of `areaId`, replacing whatever Draw holds. A
   * rectangle gets the rectangle handles unless `free` asks for plain polygon editing.
   */
  const showShape = useCallback(
    (ring: Ring, areaId: number, free = false) => {
      const draw = drawRef.current
      if (!draw) return
      const rectangular = isRectangle(ring)
      const rectHandles = rectangular && !free
      withInternal(() => {
        draw.deleteAll()
        const [featureId] = draw.add({
          type: 'Feature',
          properties: {},
          geometry: toGeoJsonPolygon(ring)
        })
        activeAreaIdRef.current = areaId
        setMode('editing')
        setShape({ rectangular, free: !rectHandles })
        draw.changeMode(rectHandles ? RECT_MODE : 'direct_select', {
          featureId
        })
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

    const draw = createDrawControl()
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
      finishedAtRef.current = Date.now()
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
      setShape((current) => ({ ...current, rectangular: isRectangle(ring) }))
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

    const drawEvents = map as unknown as DrawEventSource
    drawEvents.on('draw.create', handleCreate)
    drawEvents.on('draw.update', handleUpdate)
    drawEvents.on('draw.modechange', handleModeChange)

    return () => {
      drawEvents.off('draw.create', handleCreate)
      drawEvents.off('draw.update', handleUpdate)
      drawEvents.off('draw.modechange', handleModeChange)
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

  /**
   * The selected area's shape as it is now: the editable copy while editing (it may hold
   * changes not saved yet), else the saved boundary.
   */
  const currentRing = useCallback((): Ring | null => {
    const draw = drawRef.current
    const target = areaRef.current
    if (!draw || !target) return null
    const live =
      modeRef.current === 'editing'
        ? (
            draw.getAll().features[0]?.geometry?.coordinates as
              | number[][][]
              | undefined
          )?.[0]
        : undefined
    return ringOf(live) ?? ringOf(target.polygon)
  }, [])

  /** Squares the shape up to the map as currently seen (`bearing`) and saves it. */
  const snapToGrid = useCallback(
    (bearing: number) => {
      const target = areaRef.current
      if (!target || modeRef.current === 'drawing') return
      const current = currentRing()
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
    [scheduler, showShape, currentRing]
  )

  /**
   * Squares the shape up into the smallest rectangle around it that keeps its own
   * orientation (unlike snapToGrid, which follows the screen), and saves it.
   */
  const makeRectangle = useCallback(() => {
    const target = areaRef.current
    if (!target || modeRef.current === 'drawing') return
    const current = currentRing()
    if (!current) return
    const rect = rectangularizeRing(current)
    if (rect === current) {
      if (isRectangle(current)) {
        // Nothing to square up: just go back to the rectangle handles.
        showShape(current, target.id)
        onNoticeRef.current({
          kind: 'info',
          text: `${target.code} is already a rectangle.`
        })
      } else {
        onNoticeRef.current({
          kind: 'error',
          text: `The shape of ${target.code} is too small to make a rectangle.`
        })
      }
      return
    }
    showShape(rect, target.id)
    scheduler.schedule({
      areaId: target.id,
      code: target.code,
      ring: rect,
      message: 'Made a rectangle'
    })
    void scheduler.flush()
  }, [scheduler, showShape, currentRing])

  /**
   * Switches the open shape between plain polygon editing (`free`) and the rectangle
   * handles. Only a rectangle can have the latter; the toggle is client state, not saved.
   */
  const setFreeEditing = useCallback(
    (free: boolean) => {
      const draw = drawRef.current
      const feature = draw?.getAll().features[0]
      if (!draw || !feature || modeRef.current !== 'editing') return
      const ring = ringOf(feature.geometry?.coordinates?.[0])
      if (!ring) return
      const rectangular = isRectangle(ring)
      const rectHandles = rectangular && !free
      withInternal(() =>
        draw.changeMode(rectHandles ? RECT_MODE : 'direct_select', {
          featureId: feature.id
        })
      )
      setShape({ rectangular, free: !rectHandles })
    },
    [withInternal]
  )

  /**
   * True while a map click must be ignored by the selection logic: Draw is collecting
   * corners, or a shape was finished a moment ago and the click that closed it is still on
   * its way. Reads refs, so it is correct inside a map event handler before React re-renders.
   */
  const isClickSuppressed = useCallback(
    () =>
      isMapClickSuppressed({
        drawing:
          modeRef.current === 'drawing' ||
          finishingRef.current ||
          drawRef.current?.getMode() === 'draw_polygon',
        finishedAt: finishedAtRef.current,
        now: Date.now()
      }),
    []
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

  return {
    mode,
    shape,
    startDraw,
    cancelDraw,
    snapToGrid,
    makeRectangle,
    setFreeEditing,
    flushPending,
    isClickSuppressed
  }
}
