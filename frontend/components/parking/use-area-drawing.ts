'use client'

import {
  type GeoJsonPolygon,
  isValidRing,
  ringOf,
  toGeoJsonPolygon
} from '@/lib/parking-geometry'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
// @ts-ignore -- @mapbox/mapbox-gl-draw ships no type declarations
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type mapboxgl from 'mapbox-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

export type DrawMode = 'idle' | 'drawing' | 'editing'
export type Notice = { kind: 'info' | 'success' | 'error'; text: string }

type Options = {
  mapRef: RefObject<mapboxgl.Map | null>
  loaded: boolean
  /** Drawing is only available to admins in config mode. */
  enabled: boolean
  area: ParkingAreaRow | null
  /** Persists the area's single polygon, replacing any previous one. Must throw on failure. */
  onSave: (areaId: number, polygon: GeoJsonPolygon) => Promise<void>
  onNotice: (notice: Notice | null) => void
}

const DRAW_HINT =
  'Click each corner of the boundary on the map. Double-click the last corner to finish, Esc to cancel.'
const EDIT_HINT =
  'Drag a corner to move it, or drag a midpoint to add one. Changes save when you let go.'

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Unknown error'
}

/**
 * Admin polygon drawing on top of MapboxDraw. Exactly one polygon per area: `draw_polygon`
 * creates it (replacing the old one) and `direct_select` edits the existing one. Each
 * completed shape is validated and saved straight away; nothing is dropped silently.
 */
export function useAreaDrawing({
  mapRef,
  loaded,
  enabled,
  area,
  onSave,
  onNotice
}: Options) {
  const drawRef = useRef<MapboxDraw | null>(null)
  const [mode, setModeState] = useState<DrawMode>('idle')
  const modeRef = useRef<DrawMode>('idle')
  // True while a freshly drawn shape is being saved; draw_polygon changes mode right after
  // `draw.create`, which must not look like a cancelled drawing.
  const savingRef = useRef(false)
  const areaRef = useRef(area)
  const onSaveRef = useRef(onSave)
  const onNoticeRef = useRef(onNotice)
  areaRef.current = area
  onSaveRef.current = onSave
  onNoticeRef.current = onNotice

  const setMode = useCallback((next: DrawMode) => {
    modeRef.current = next
    setModeState(next)
  }, [])

  const reset = useCallback(() => {
    // Leave 'editing'/'drawing' first so the resulting modechange is not treated as a cancel.
    setMode('idle')
    const draw = drawRef.current
    if (draw) {
      draw.deleteAll()
      draw.changeMode('simple_select')
    }
  }, [setMode])

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

    const save = async (feature: { geometry?: { coordinates?: unknown } }) => {
      const target = areaRef.current
      if (!target) return
      const ring = (
        feature.geometry?.coordinates as number[][][] | undefined
      )?.[0]
      if (!isValidRing(ring)) {
        onNoticeRef.current({
          kind: 'error',
          text: 'That shape is not valid (it needs at least 3 corners). Nothing was saved.'
        })
        return
      }
      try {
        await onSaveRef.current(target.id, toGeoJsonPolygon(ring))
        onNoticeRef.current({
          kind: 'success',
          text: `Boundary for ${target.code} saved.`
        })
      } catch (err) {
        onNoticeRef.current({
          kind: 'error',
          text: `Could not save the boundary for ${target.code}: ${messageOf(err)}`
        })
      }
    }

    const handleCreate = async (e: {
      features: Array<{ geometry?: { coordinates?: unknown } }>
    }) => {
      const feature = e.features[0]
      savingRef.current = true
      try {
        if (feature) await save(feature)
        // The saved shape is drawn by the area layers; drop MapboxDraw's temporary copy.
        setMode('idle')
        draw.deleteAll()
        draw.changeMode('simple_select')
      } finally {
        savingRef.current = false
      }
    }
    const handleUpdate = (e: {
      features: Array<{ geometry?: { coordinates?: unknown } }>
    }) => {
      const feature = e.features[0]
      if (feature) void save(feature)
    }
    const handleModeChange = (e: { mode: string }) => {
      if (e.mode !== 'simple_select' || savingRef.current) return
      if (modeRef.current === 'drawing') {
        // Esc (or similar) abandoned the shape before it was completed.
        setMode('idle')
        onNoticeRef.current({ kind: 'info', text: 'Drawing cancelled.' })
      } else if (modeRef.current === 'editing') {
        // A click beside the shape drops its selection; keep the corner handles available.
        const feature = draw.getAll().features[0]
        if (feature) {
          setTimeout(() => {
            if (modeRef.current === 'editing') {
              draw.changeMode('direct_select', { featureId: feature.id })
            }
          }, 0)
        }
      }
    }

    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)
    map.on('draw.modechange', handleModeChange)

    return () => {
      map.off('draw.create', handleCreate)
      map.off('draw.update', handleUpdate)
      map.off('draw.modechange', handleModeChange)
      // The map may already be gone when the whole page unmounts.
      if (mapRef.current === map) map.removeControl(draw)
      drawRef.current = null
      modeRef.current = 'idle'
      setModeState('idle')
    }
  }, [mapRef, loaded, enabled, setMode])

  // Selecting another area abandons whatever shape was in progress.
  const areaId = area?.id ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the selection changes
  useEffect(() => {
    if (modeRef.current !== 'idle') reset()
  }, [areaId])

  const startDraw = useCallback(() => {
    const draw = drawRef.current
    if (!draw || !areaRef.current) return
    draw.deleteAll()
    draw.changeMode('draw_polygon')
    setMode('drawing')
    onNoticeRef.current({ kind: 'info', text: DRAW_HINT })
  }, [setMode])

  const startEdit = useCallback(() => {
    const draw = drawRef.current
    const target = areaRef.current
    if (!draw || !target) return
    const ring = ringOf(target.polygon)
    if (!ring) {
      onNoticeRef.current({
        kind: 'error',
        text: `${target.code} has no boundary to edit yet. Use Draw boundary first.`
      })
      return
    }
    draw.deleteAll()
    const [featureId] = draw.add({
      type: 'Feature',
      properties: {},
      geometry: toGeoJsonPolygon(ring)
    })
    setMode('editing')
    draw.changeMode('direct_select', { featureId })
    onNoticeRef.current({ kind: 'info', text: EDIT_HINT })
  }, [setMode])

  const finish = useCallback(() => {
    reset()
    onNoticeRef.current(null)
  }, [reset])

  return { mode, startDraw, startEdit, finish }
}
