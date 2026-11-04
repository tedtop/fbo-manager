'use client'

import { normalizeHeading } from '@/lib/parking-map'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

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

/** Creates the satellite map in `containerRef` and exposes its load state and bearing. */
export function useMapInstance(containerRef: RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [bearing, setBearing] = useState(DEFAULT_BEARING)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!token) {
      setError(
        'The map cannot load: NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set.'
      )
      return
    }
    mapboxgl.accessToken = token

    const view = readSavedView()
    setBearing(Math.round(normalizeHeading(view.bearing)))

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container,
        style: {
          version: 8,
          glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
          sources: {
            'esri-satellite': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              ],
              tileSize: 256,
              attribution:
                '© Esri, Maxar, Earthstar Geographics, and the GIS User Community'
            }
          },
          layers: [
            {
              id: 'esri-satellite-layer',
              type: 'raster',
              source: 'esri-satellite',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        },
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

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.on('load', () => setLoaded(true))
    map.on('rotate', () =>
      setBearing(Math.round(normalizeHeading(map.getBearing())))
    )
    map.on('error', (e) => {
      console.error('Map error:', e.error ?? e)
    })
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      setLoaded(false)
    }
  }, [containerRef])

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

  return { mapRef, loaded, bearing, error, saveDefaultView }
}
