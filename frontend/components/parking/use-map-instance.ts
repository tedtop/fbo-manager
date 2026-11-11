'use client'

import {
  BASEMAP_STORAGE_KEY,
  type BasemapId,
  DEFAULT_BASEMAP_ID,
  buildMapStyle,
  getBasemap,
  readStoredBasemapId
} from '@/lib/basemaps'
import { configureMapLibreWorker } from '@/lib/maplibre-worker'
import { normalizeHeading } from '@/lib/parking-map'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { swapBasemap } from './basemap-layer'

// Minuteman Aviation ramp - the default view for day-to-day operations.
const DEFAULT_CENTER: [number, number] = [
  -114.08587471583614, 46.92183963008256
]
const DEFAULT_ZOOM = 17.97576240461887
const DEFAULT_BEARING = 40

const STORAGE_KEYS = {
  lat: 'fbo_map_center_lat',
  lng: 'fbo_map_center_lng',
  zoom: 'fbo_map_zoom',
  bearing: 'fbo_map_bearing'
}

function readSavedView(): {
  center: [number, number]
  zoom: number
  bearing: number
} {
  try {
    const lat = Number.parseFloat(localStorage.getItem(STORAGE_KEYS.lat) ?? '')
    const lng = Number.parseFloat(localStorage.getItem(STORAGE_KEYS.lng) ?? '')
    const zoom = Number.parseFloat(
      localStorage.getItem(STORAGE_KEYS.zoom) ?? ''
    )
    const bearing = Number.parseFloat(
      localStorage.getItem(STORAGE_KEYS.bearing) ?? ''
    )
    return {
      center:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? [lng, lat]
          : DEFAULT_CENTER,
      zoom: Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM,
      bearing: Number.isFinite(bearing) ? bearing : DEFAULT_BEARING
    }
  } catch {
    // Storage can be unavailable (private mode); fall back to the built-in view.
    return {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: DEFAULT_BEARING
    }
  }
}

/** Creates the satellite map in `containerRef` and exposes its load state, bearing and basemap. */
export function useMapInstance(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [basemapId, setBasemapIdState] = useState<BasemapId>(DEFAULT_BASEMAP_ID)
  // The basemap the map's style currently holds (the choice is applied after it changes).
  const appliedBasemapRef = useRef<BasemapId>(DEFAULT_BASEMAP_ID)
  const [bearing, setBearing] = useState(DEFAULT_BEARING)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = readSavedView()
    setBearing(Math.round(normalizeHeading(view.bearing)))

    let stored: BasemapId = DEFAULT_BASEMAP_ID
    try {
      stored = readStoredBasemapId(localStorage)
    } catch {
      // Storage can be unavailable (private mode); use the default basemap.
    }
    appliedBasemapRef.current = stored
    setBasemapIdState(stored)

    let map: MapLibreMap
    try {
      configureMapLibreWorker()
      map = new MapLibreMap({
        container,
        style: buildMapStyle(getBasemap(stored)),
        center: view.center,
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: 0
      })
    } catch (err) {
      setError(
        `The map failed to start: ${err instanceof Error ? err.message : String(err)}`
      )
      return
    }

    map.addControl(new NavigationControl(), 'top-right')
    map.on('load', () => setLoaded(true))
    map.on('rotate', () =>
      setBearing(Math.round(normalizeHeading(map.getBearing())))
    )
    map.on('error', (e) => {
      console.error('Map error:', e.error ?? e)
    })
    mapRef.current = map
    // Test seam, only inside a Cypress run: specs turn coordinates into pointer positions.
    if ((window as { Cypress?: unknown }).Cypress) {
      ;(window as { __parkingMap?: MapLibreMap }).__parkingMap = map
    }

    return () => {
      map.remove()
      mapRef.current = null
      setLoaded(false)
    }
  }, [containerRef])

  // A new choice swaps only the raster basemap, so area layers, Draw and markers stay.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || appliedBasemapRef.current === basemapId) return
    appliedBasemapRef.current = basemapId
    swapBasemap(map, getBasemap(basemapId))
  }, [loaded, basemapId])

  const setBasemapId = useCallback((id: BasemapId) => {
    setBasemapIdState(id)
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, id)
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  }, [])

  /** Remember the current centre, zoom and bearing as this browser's default view. */
  const saveDefaultView = useCallback((): boolean => {
    const map = mapRef.current
    if (!map) return false
    const center = map.getCenter()
    try {
      localStorage.setItem(STORAGE_KEYS.lat, String(center.lat))
      localStorage.setItem(STORAGE_KEYS.lng, String(center.lng))
      localStorage.setItem(STORAGE_KEYS.zoom, String(map.getZoom()))
      localStorage.setItem(STORAGE_KEYS.bearing, String(map.getBearing()))
      return true
    } catch {
      return false
    }
  }, [])

  return {
    mapRef,
    loaded,
    bearing,
    error,
    saveDefaultView,
    basemapId,
    setBasemapId
  }
}
