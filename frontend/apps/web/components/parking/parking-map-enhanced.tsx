import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
// @ts-ignore
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { useQuery, useMutation, useQueryClient, keepPreviousData, useIsMutating } from '@tanstack/react-query'

import { ApiClient } from '@frontend/types/api/ApiClient'
import { getAircraftSize } from '@/lib/aircraft-sizes'
import { findParkingLocationAtPoint } from '@/lib/point-in-polygon'
import { ParkingLocationPanel } from './parking-location-panel'
import { Button } from '@frontend/ui/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { AircraftSheet } from './aircraft-sheet'
import { useSession } from 'next-auth/react'
import { AIRCRAFT_TYPES, getAircraftDefinition, DEFAULT_AIRCRAFT_TYPE } from '@/lib/aircraft-types'

// Minuteman Aviation Ramp - Optimal view for day-to-day operations
// TODO: Move these default view settings to a `parking_map_configurations` table
// to allow per-airport/user customization instead of hardcoding
const MINUTEMAN_RAMP_CENTER: [number, number] = [-114.08587471583614, 46.92183963008256]
const INITIAL_ZOOM = 17.97576240461887
const INITIAL_BEARING = 40
interface ParkingMapProps {
  configMode: boolean
  isAdmin: boolean
}

interface ParkingLocation {
  id: number
  location_code: string
  description?: string
  latitude?: string | null
  longitude?: string | null
  polygon?: any // Can be number[][] or GeoJSON object
  airport?: string
  display_order?: number
}

interface GenericAircraftMetadata {
  type: 'generic_aircraft'
  rotation: number
  aircraftType: string
  tailNumber: string
  color?: string
}

export function ParkingMapEnhanced({ configMode, isAdmin }: ParkingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const draw = useRef<MapboxDraw | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [selectedLocation, setSelectedLocation] =
    useState<ParkingLocation | null>(null)
  const [drawControlAdded, setDrawControlAdded] = useState(false)
  const [currentBearing, setCurrentBearing] = useState(320)
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const token = (session as any)?.accessToken as string

  // Generic Aircraft State
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null)
  const selectedAircraftIdRef = useRef<number | null>(null)

  useEffect(() => {
    selectedAircraftIdRef.current = selectedAircraftId
    // Undo stack is now in localStorage per aircraft, no need to clear
  }, [selectedAircraftId])

  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  // Store temporary overrides for smooth UI updates (id -> partial metadata + coordinates)
  const [previewOverrides, setPreviewOverrides] = useState<Record<number, Partial<GenericAircraftMetadata> & { lat?: number; lng?: number }>>({})
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [hasPendingSave, setHasPendingSave] = useState(false)
  const savePendingRef = useRef<Map<number, NodeJS.Timeout>>(new Map())
  const previewOverridesRef = useRef(previewOverrides) // Ref for performance optimizations

  // TODO: Create a `parking_map_configurations` table to store default view settings (center, zoom, bearing) per airport/user instead of localStorage.

  const isMutating = useIsMutating()


  // Prevent page exit when saving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if we are currently mutating OR if there is a pending save timeout OR if we're actively saving
      const shouldPrevent = isMutating > 0 || (window as any).saveTimeout || isSavingRef.current

      if (shouldPrevent) {
        e.preventDefault()
        // Modern browsers require returnValue to be set
        e.returnValue = 'Changes are being saved. Are you sure you want to leave?'
        return 'Changes are being saved. Are you sure you want to leave?'
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isMutating])

  // ... (existing code) ...


  // ... (existing code) ...

  const apiClient = new ApiClient({
    BASE: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    TOKEN: token,
  })

  // Fetch parking locations
  // Sync previewOverridesRef with state
  useEffect(() => {
    previewOverridesRef.current = { ...previewOverridesRef.current, ...previewOverrides }
  }, [previewOverrides])

  const { data: parkingLocationsData, isLoading: isParkingLoading } =    // Fetch all parking locations (handle pagination)
    useQuery({
      queryKey: ['parking-locations'],
      queryFn: async () => {
        let allResults: any[] = []
        let page = 1
        let hasMore = true

        while (hasMore) {
          const response = await apiClient.parkingLocations.parkingLocationsList('-id', page, undefined, 100)
          if (response.results) {
            allResults = [...allResults, ...response.results]
          }

          if (response.next) {
            page++
          } else {
            hasMore = false
          }
        }
        return allResults
      },
      placeholderData: keepPreviousData,
    })

  const parkingLocations = parkingLocationsData || []

  // Filter for generic aircraft locations
  const genericAircraftLocations = parkingLocations.filter(loc => {
    try {
      if (!loc.description) return false
      const metadata = JSON.parse(loc.description)
      return metadata.type === 'generic_aircraft'
    } catch (e) {
      return false
    }
  })

  // Fetch flights with parking locations
  const { data: flightsData } = useQuery({
    queryKey: ['flights-with-parking'],
    queryFn: async () => {
      const response = await apiClient.flights.flightsList()
      return response.results || []
    },
  })

  const flights = flightsData || []

  // Create parking location mutation
  const createLocationMutation = useMutation({
    mutationFn: async (data: Partial<ParkingLocation>) => {
      return await apiClient.parkingLocations.parkingLocationsCreate(data as any)
    },
    onMutate: async (newLocation) => {
      await queryClient.cancelQueries({ queryKey: ['parking-locations'] })
      const previousLocations = queryClient.getQueryData(['parking-locations'])

      queryClient.setQueryData(['parking-locations'], (old: any[]) => {
        // Create a temporary optimistic location
        const tempLocation = {
          id: -Date.now(), // Temporary ID
          ...newLocation,
          // Ensure required fields for rendering are present
          location_code: newLocation.location_code || 'TEMP',
        }
        return [tempLocation, ...(old || [])]
      })

      return { previousLocations }
    },
    onError: (err, newLocation, context) => {
      queryClient.setQueryData(['parking-locations'], context?.previousLocations)
      console.error('Failed to create parking location:', err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['parking-locations'] })
    },
  })

  // Update parking location mutation
  const updateLocationMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: Partial<ParkingLocation>
    }) => {
      return await apiClient.parkingLocations.parkingLocationsPartialUpdate(
        id,
        data as any
      )
    },
    onSuccess: (data, variables) => {
      // Don't clear preview overrides or invalidate here
      // The keyup handler will handle refetching and clearing preview overrides
      // after waiting for the refetch to complete
      isSavingRef.current = false
    },
    onError: (err, newLocation, context?: { previousLocations: any }) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(['parking-locations'], context?.previousLocations)
      console.error('Failed to update parking location:', err)
      isSavingRef.current = false
    },
    onMutate: async (newLocation) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['parking-locations'] })

      // Snapshot the previous value
      const previousLocations = queryClient.getQueryData(['parking-locations'])

      // DON'T do optimistic updates here - let preview overrides handle the display
      // Optimistic updates cause jumps because they update the cache with stale positions
      // The preview overrides already show the correct current position

      // Return a context object with the snapshotted value
      return { previousLocations }
    },
    onSettled: () => {
      // Don't invalidate here - the keyup handler controls when to refetch
      // This prevents refetches from happening at the wrong time
    },
  })

  // Delete parking location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiClient.parkingLocations.parkingLocationsDestroy(id)
    },
    onMutate: async (deletedId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['parking-locations'] })

      // Snapshot the previous value
      const previousLocations = queryClient.getQueryData(['parking-locations'])

      // Optimistically update to the new value
      queryClient.setQueryData(['parking-locations'], (old: any[]) => {
        return (old || []).filter((loc) => loc.id !== deletedId)
      })

      // Close sheet immediately
      setSelectedLocation(null)
      setSelectedAircraftId(null)
      setIsSheetOpen(false)

      // Return a context object with the snapshotted value
      return { previousLocations }
    },
    onError: (err, newLocation, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(['parking-locations'], context?.previousLocations)
      console.error('Failed to delete parking location:', err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['parking-locations'] })
    },
  })

  // Update flight parking location mutation
  const updateFlightLocationMutation = useMutation({
    mutationFn: async ({
      flightId,
      locationId,
    }: {
      flightId: number
      locationId: number | null
    }) => {
      return await apiClient.flights.flightsPartialUpdate(flightId, {
        location: locationId,
      } as any)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flights-with-parking'] })
    },
    onError: (error: any) => {
      console.error('Failed to update flight location:', error)
    },
  })

  // Local Storage Keys
  const STORAGE_KEYS = {
    CENTER_LAT: 'fbo_map_center_lat',
    CENTER_LNG: 'fbo_map_center_lng',
    ZOOM: 'fbo_map_zoom',
    BEARING: 'fbo_map_bearing'
  }

  // Initialize Mapbox
  useEffect(() => {
    if (map.current) return
    if (!mapContainer.current) return

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (!mapboxToken) {
      console.error('Mapbox access token not found')
      return
    }

    mapboxgl.accessToken = mapboxToken

    // Load saved view or use defaults
    const savedLat = localStorage.getItem(STORAGE_KEYS.CENTER_LAT)
    const savedLng = localStorage.getItem(STORAGE_KEYS.CENTER_LNG)
    const savedZoom = localStorage.getItem(STORAGE_KEYS.ZOOM)
    const savedBearing = localStorage.getItem(STORAGE_KEYS.BEARING)

    const initialCenter: [number, number] = (savedLat && savedLng)
      ? [parseFloat(savedLng), parseFloat(savedLat)]
      : MINUTEMAN_RAMP_CENTER

    const initialZoomVal = savedZoom ? parseFloat(savedZoom) : INITIAL_ZOOM
    const initialBearingVal = savedBearing ? parseFloat(savedBearing) : 40

    setCurrentBearing(initialBearingVal)

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
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
              attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community'
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
        center: initialCenter,
        zoom: initialZoomVal,
        pitch: 0,
        bearing: initialBearingVal,
      })

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

      // Initialize drawing controls (Shelved - not adding control to map)
      draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        defaultMode: 'simple_select',
      })

      map.current.on('load', () => {
        setMapLoaded(true)
      })

      map.current.on('error', (e) => {
        console.error('Map error:', e)
      })

      // Deselect aircraft when clicking on map background
      map.current.on('click', (e) => {
        if (e.defaultPrevented) return; // If click was handled by a marker
        // Don't deselect if clicking on the sheet or controls (handled by propagation)
        // But map click means background.
        setSelectedAircraftId(null);
        setIsSheetOpen(false);
        setContextMenu(null);
      });

      // Right click to show context menu
      map.current.on('contextmenu', (e) => {
        e.preventDefault()
        setContextMenu({ x: e.point.x, y: e.point.y })
      })

      // Close context menu on move
      map.current.on('move', () => {
        setContextMenu(null)
      })

    } catch (error) {
      console.error('Failed to initialize map:', error)
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Handle config mode toggle and load polygons into draw (Shelved - but keeping logic for viewing existing polygons if needed)
  // Modified to NOT show draw controls as requested
  useEffect(() => {
    if (!map.current || !draw.current || !mapLoaded) return

    // We are shelving the polygon drawing UI, so we won't add the draw control.
    // But we might still want to visualize them? 
    // The requirement says "shelve the polygon parking areas idea".
    // So I will disable the draw control addition.

    /* 
    if (configMode && isAdmin) {
       // ... draw control logic shelved ...
    }
    */
  }, [configMode, isAdmin, mapLoaded, parkingLocations, drawControlAdded])

  // Add parking location polygons to map (when not in config mode)
  // Keeping this so existing polygons are still visible as context, but not editable
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Remove existing layers
    if (map.current.getLayer('parking-locations-fill')) {
      map.current.removeLayer('parking-locations-fill')
    }
    if (map.current.getLayer('parking-locations-outline')) {
      map.current.removeLayer('parking-locations-outline')
    }
    if (map.current.getLayer('parking-locations-labels')) {
      map.current.removeLayer('parking-locations-labels')
    }
    if (map.current.getSource('parking-locations')) {
      map.current.removeSource('parking-locations')
    }

    // Add parking location polygons as a source and layer
    map.current.addSource('parking-locations', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: parkingLocations
          .filter((loc) => loc.polygon && loc.polygon.length > 0)
          .map((loc) => ({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [loc.polygon!],
            },
            properties: {
              id: loc.id,
              name: loc.location_code,
              description: loc.description,
            },
          })),
      },
    })

    // Add fill layer
    map.current.addLayer({
      id: 'parking-locations-fill',
      type: 'fill',
      source: 'parking-locations',
      paint: {
        'fill-color': '#00ffff',
        'fill-opacity': 0.2, // Reduced opacity since we are focusing on aircraft
      },
    })

    // Add outline layer
    map.current.addLayer({
      id: 'parking-locations-outline',
      type: 'line',
      source: 'parking-locations',
      paint: {
        'line-color': '#00ffff',
        'line-width': 2,
      },
    })

    // Add labels - improved visibility with larger text and stronger halo
    map.current.addLayer({
      id: 'parking-locations-labels',
      type: 'symbol',
      source: 'parking-locations',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 16,
        'text-anchor': 'center',
        'text-offset': [0, 0],
        'text-allow-overlap': true,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 3,
        'text-halo-blur': 1,
      },
    })
  }, [mapLoaded, parkingLocations])

  // Helper to calculate feet per pixel at current latitude
  const getFeetPerPixel = (lat: number, zoomLevel: number) => {
    // Earth circumference in feet approx 131,479,725 ft
    // C * cos(lat) / 2^zoom
    // 156543.03392 meters * 3.28084 = 513592.7 ft (approx)
    // Let's use the standard meters value and convert
    const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoomLevel)
    return metersPerPixel * 3.28084
  }

  // Store markers in a ref to avoid recreation
  const markersRef = useRef<Map<number, mapboxgl.Marker>>(new Map())

  // Helper function to create aircraft SVG icon (top-down view)
  const createAircraftIcon = (aircraftType: string, tailNumber: string, color: string = '#ffffff', isSelected: boolean = false, scale: number = 1) => {
    const def = getAircraftDefinition(aircraftType)

    // Calculate pixel dimensions based on real-world FEET and current map scale
    // def.wingspan and def.length are in FEET.

    const widthPixels = def.wingspan * scale
    const heightPixels = def.length * scale

    // Detailed airliner silhouette - Scaled to fill 0-100 viewBox (approx)
    // Wingspan: 0 to 100
    // Length: 0 to 100
    const svg = `<svg width="${widthPixels}" height="${heightPixels}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="transform-origin: center;">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="1" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.5"/>
            </feComponentTransfer>
            <feMerge> 
              <feMergeNode in="offsetblur"/>
              <feMergeNode in="SourceGraphic"/> 
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#shadow)">
            <!-- Fuselage (Center at 50, Width ~10-12, Length 5-95) -->
            <path d="M 45 2 C 45 0 55 0 55 2 L 56 30 L 56 92 C 56 98 54 100 50 100 C 46 100 44 98 44 92 L 44 30 Z" fill="${color}" stroke="${isSelected ? '#f59e0b' : '#000000'}" stroke-width="${isSelected ? '3' : '1'}" />
            <!-- Wings (Span 0-100) -->
            <path d="M 44 35 L 0 55 L 0 65 L 44 50 L 44 35 M 56 35 L 100 55 L 100 65 L 56 50 L 56 35" fill="${color}" stroke="${isSelected ? '#f59e0b' : '#000000'}" stroke-width="${isSelected ? '3' : '1'}" />
            <!-- Tail (Span ~30-70) -->
            <path d="M 46 90 L 30 98 L 30 100 L 46 95 L 46 90 M 54 90 L 70 98 L 70 100 L 54 95 L 54 90" fill="${color}" stroke="${isSelected ? '#f59e0b' : '#000000'}" stroke-width="${isSelected ? '3' : '1'}" />
        </g>
        <text x="50" y="50" font-family="Arial" font-size="12" font-weight="bold" fill="${color === '#ffffff' ? '#000000' : '#ffffff'}" stroke="none" text-anchor="middle" dominant-baseline="middle" transform="rotate(0, 50, 50)">${tailNumber}</text>
      </svg>`

    return {
      src: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      width: widthPixels,
      height: heightPixels
    }
  }

  // Update markers when zoom changes
  useEffect(() => {
    if (!map.current) return

    const updateMarkers = () => {
      const currentZoom = map.current!.getZoom()
      const center = map.current!.getCenter()
      const feetPerPixel = getFeetPerPixel(center.lat, currentZoom)
      const scale = 1 / feetPerPixel

      // Update generic aircraft markers
      markersRef.current.forEach((marker, id) => {
        const el = marker.getElement()
        const img = el.querySelector('img')
        if (img && img.dataset.type) {
          const def = getAircraftDefinition(img.dataset.type)
          img.style.width = `${def.wingspan * scale}px`
          img.style.height = `${def.length * scale}px`
        }
      })

      // Update real flight markers (existing logic)
      const flightMarkers = document.querySelectorAll('.aircraft-marker img')
      flightMarkers.forEach((img: any) => {
        const type = img.dataset.type
        if (type) {
          const def = getAircraftDefinition(type)
          img.style.width = `${def.wingspan * scale}px`
          img.style.height = `${def.length * scale}px`
        }
      })
    }

    map.current.on('zoom', updateMarkers)
    map.current.on('move', updateMarkers) // Latitude changes affect scale

    return () => {
      if (map.current) {
        map.current.off('zoom', updateMarkers)
        map.current.off('move', updateMarkers)
      }
    }
  }, [mapLoaded])

  // Add aircraft markers (Real Flights)
  useEffect(() => {
    if (!map.current || !mapLoaded || !flights) return

    // Remove existing flight markers
    const markers = document.querySelectorAll('.aircraft-marker')
    markers.forEach((marker) => marker.remove())

    // Group flights by location for stacking
    const flightsByLocation = new Map<number, any[]>()
    flights.forEach((flight: any) => {
      if (flight.location_details && flight.location) {
        const existing = flightsByLocation.get(flight.location) || []
        flightsByLocation.set(flight.location, [...existing, flight])
      }
    })

    const currentZoom = map.current.getZoom()
    const center = map.current.getCenter()
    const feetPerPixel = getFeetPerPixel(center.lat, currentZoom)
    const scale = 1 / feetPerPixel

    // Add markers for aircraft with parking locations
    flights.forEach((flight: any) => {
      if (
        flight.location_details &&
        flight.location_details.latitude &&
        flight.location_details.longitude
      ) {
        const aircraftType = flight.aircraft_details.aircraft_type_icao || DEFAULT_AIRCRAFT_TYPE

        // Calculate offset for stacking aircraft in same location
        const aircraftsAtLocation = flightsByLocation.get(flight.location) || []
        const indexAtLocation = aircraftsAtLocation.findIndex((f: any) => f.id === flight.id)
        const offsetAngle = (indexAtLocation / aircraftsAtLocation.length) * 2 * Math.PI
        const stackRadius = aircraftsAtLocation.length > 1 ? 0.00003 * indexAtLocation : 0

        const offsetLng = Math.cos(offsetAngle) * stackRadius
        const offsetLat = Math.sin(offsetAngle) * stackRadius

        const el = document.createElement('div')
        el.className = 'aircraft-marker'
        el.style.cursor = configMode ? 'default' : 'grab'
        el.style.transition = 'transform 0.2s, filter 0.2s'
        el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        el.title = `${flight.aircraft_details.tail_number} - ${flight.location_details.location_code}`

        // Create aircraft icon
        const iconData = createAircraftIcon(aircraftType, flight.aircraft_details.tail_number, '#3b82f6', false, scale) // Default blue for real flights
        const img = document.createElement('img')
        img.src = iconData.src
        img.style.width = `${iconData.width}px`
        img.style.height = `${iconData.height}px`
        img.style.display = 'block'
        img.dataset.type = aircraftType // Store type for resizing
        el.appendChild(img)

        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.3)'
          el.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'
          el.style.zIndex = '1000'
        })
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)'
          el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
          el.style.zIndex = ''
        })

        const baseLng = parseFloat(flight.location_details.longitude)
        const baseLat = parseFloat(flight.location_details.latitude)

        const marker = new mapboxgl.Marker({
          element: el,
          draggable: !configMode,
          rotationAlignment: 'map', // Rotate with map
          pitchAlignment: 'map'
        })
          .setLngLat([baseLng + offsetLng, baseLat + offsetLat])
          .setRotation(0) // Real flights don't have rotation data yet, default to 0
          .addTo(map.current!)

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div class="p-2">
            <h3 class="font-bold">${flight.aircraft_details.tail_number}</h3>
            <p class="text-sm">${flight.aircraft_details.aircraft_type_display || 'Unknown Type'}</p>
            <p class="text-xs text-gray-600">${flight.location_details.location_code}</p>
            ${aircraftsAtLocation.length > 1 ? `<p class="text-xs text-blue-600">${aircraftsAtLocation.length} aircraft at this location</p>` : ''}
          </div>`
        )

        marker.setPopup(popup)

        // Handle drag start
        if (!configMode) {
          marker.getElement().addEventListener('dragstart', () => {
            el.style.cursor = 'grabbing'
          })
        }

        // Handle drag end to update parking location
        if (!configMode) {
          marker.on('dragend', async () => {
            el.style.cursor = 'grab'
            const lngLat = marker.getLngLat()
            const point: [number, number] = [lngLat.lng, lngLat.lat]

            // Prepare locations with normalized polygons for point check
            const locationsWithPolygons = parkingLocations
              .filter(loc => loc.polygon)
              .map(loc => {
                const coordinates = (loc.polygon as any)?.coordinates || loc.polygon
                return {
                  id: loc.id,
                  location_code: loc.location_code,
                  polygon: Array.isArray(coordinates) ? coordinates : null
                }
              })
              .filter(loc => loc.polygon !== null)

            // Find which parking location contains this point
            const newLocation = findParkingLocationAtPoint(
              point,
              locationsWithPolygons as any
            )

            if (newLocation) {
              // Update the flight's parking location
              try {
                await updateFlightLocationMutation.mutateAsync({
                  flightId: flight.id,
                  locationId: newLocation.id,
                })

                // Update popup
                popup.setHTML(
                  `<div class="p-2">
                    <h3 class="font-bold">${flight.aircraft_details.tail_number}</h3>
                    <p class="text-sm">${flight.aircraft_details.aircraft_type_display || 'Unknown Type'}</p>
                    <p class="text-xs text-green-600">Moved to: ${newLocation.location_code}</p>
                  </div>`
                )
              } catch (error) {
                console.error('Failed to update aircraft location:', error)
                marker.setLngLat([baseLng + offsetLng, baseLat + offsetLat])
              }
            } else {
              // Revert to original position if dropped outside parking areas
              marker.setLngLat([baseLng + offsetLng, baseLat + offsetLat])
            }
          })
        }
      }
    })
  }, [mapLoaded, flights, configMode, parkingLocations, updateFlightLocationMutation])


  // Render Generic Aircrafts (Persisted in ParkingLocations)
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const currentZoom = map.current.getZoom()
    const center = map.current.getCenter()
    const feetPerPixel = getFeetPerPixel(center.lat, currentZoom)
    const scale = 1 / feetPerPixel

    // Track which IDs are currently active to remove stale ones
    const activeIds = new Set<number>()

    genericAircraftLocations.forEach((loc) => {
      activeIds.add(loc.id)

      // Skip update if this aircraft is currently being dragged
      if (draggingId === loc.id) return

      let metadata: GenericAircraftMetadata
      try {
        metadata = JSON.parse(loc.description || '{}')
      } catch (e) {
        return
      }

      // Apply preview overrides if they exist
      if (previewOverrides[loc.id]) {
        metadata = { ...metadata, ...previewOverrides[loc.id] }
      }

      const aircraftType = metadata.aircraftType || DEFAULT_AIRCRAFT_TYPE
      const isSelected = selectedAircraftId === loc.id
      const rotation = metadata.rotation || 0

      // Check if marker exists
      let marker = markersRef.current.get(loc.id)

      if (marker) {
        // Update existing marker APPEARANCE only, never position/rotation
        // The marker position is the source of truth and should not be overwritten
        const el = marker.getElement()
        const img = el.querySelector('img')

        const iconData = createAircraftIcon(
          aircraftType,
          metadata.tailNumber || 'GENERIC',
          metadata.color || '#ffffff',
          isSelected,
          scale
        )

        if (img) {
          // Only update src if it changed (optimization)
          if (img.src !== iconData.src) img.src = iconData.src
          img.style.width = `${iconData.width}px`
          img.style.height = `${iconData.height}px`
          img.dataset.type = aircraftType
        }

        el.style.filter = isSelected
          ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.8))'
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'

        // Apply preview overrides from Ref (more up to date than state during drags)
        const override = previewOverridesRef.current[loc.id]
        if (override?.rotation !== undefined) {
          marker.setRotation(override.rotation)
        }

      } else {
        // Create new marker
        const el = document.createElement('div')
        el.className = 'generic-aircraft-marker'
        el.style.cursor = configMode ? 'default' : 'move'
        el.style.transition = 'filter 0.2s'
        el.style.filter = isSelected
          ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.8))'
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'

        const iconData = createAircraftIcon(
          aircraftType,
          metadata.tailNumber || 'GENERIC',
          metadata.color || '#ffffff',
          isSelected,
          scale
        )

        const img = document.createElement('img')
        img.src = iconData.src
        img.style.width = `${iconData.width}px`
        img.style.height = `${iconData.height}px`
        img.style.display = 'block'
        img.dataset.type = aircraftType
        el.appendChild(img)

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          if (!configMode) {
            setSelectedAircraftId(loc.id)
            setIsSheetOpen(true)
          }
        })

        // Check localStorage first for the most up-to-date position
        const savedPosition = JSON.parse(localStorage.getItem(`aircraft_${loc.id}_position`) || 'null')
        const displayLng = savedPosition?.lng ?? (previewOverrides[loc.id]?.lng ?? parseFloat(loc.longitude || '0'))
        const displayLat = savedPosition?.lat ?? (previewOverrides[loc.id]?.lat ?? parseFloat(loc.latitude || '0'))
        const displayRotation = savedPosition?.rotation ?? rotation

        marker = new mapboxgl.Marker({
          element: el,
          draggable: !configMode,
          rotationAlignment: 'map',
          pitchAlignment: 'map'
        })
          .setLngLat([displayLng, displayLat])
          .setRotation(displayRotation)
          .addTo(map.current!)

        if (!configMode) {
          marker.on('dragstart', () => {
            setDraggingId(loc.id)

            // Save position before drag for undo
            const pos = marker!.getLngLat()
            const dragStartPosition = {
              id: loc.id,
              lat: pos.lat,
              lng: pos.lng,
              rotation: marker!.getRotation()
            }

            // Save to undo stack
            const undoStack = JSON.parse(localStorage.getItem(`aircraft_${loc.id}_undo`) || '[]')
            undoStack.push(dragStartPosition)

            // Limit undo stack to 20 entries
            if (undoStack.length > 20) {
              undoStack.shift()
            }

            localStorage.setItem(`aircraft_${loc.id}_undo`, JSON.stringify(undoStack))
          })

          marker.on('dragend', () => {
            setDraggingId(null)
            // Marker position is already updated by Mapbox
            // Schedule database save after 1.5s delay
            scheduleSave(loc.id, marker!)
          })
        }

        markersRef.current.set(loc.id, marker)
      }
    })

    // Remove markers that are no longer in the list
    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })

  }, [mapLoaded, genericAircraftLocations, selectedAircraftId, configMode, updateLocationMutation])

  // Save unsaved positions to database before user leaves the page
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      // Check each marker for unsaved positions
      markersRef.current.forEach((marker, id) => {
        const aircraft = genericAircraftLocations.find(loc => loc.id === id)
        if (!aircraft) return

        // Get current marker position (source of truth)
        const markerPos = marker.getLngLat()
        const markerRotation = marker.getRotation()

        // Get database position
        const dbLat = parseFloat(aircraft.latitude || '0')
        const dbLng = parseFloat(aircraft.longitude || '0')

        const threshold = 0.000001
        if (Math.abs(markerPos.lat - dbLat) > threshold ||
          Math.abs(markerPos.lng - dbLng) > threshold) {
          // There are unsaved changes - save them synchronously
          handleUpdateAircraft(id, {
            coordinates: { x: markerPos.lng, y: markerPos.lat },
            rotation: markerRotation
          }).catch(err => {
            console.error('Failed to save aircraft position before unload:', err)
          })
        }
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [genericAircraftLocations])

  // Zoom to selected location (Shelved - mostly for polygons)
  const handleSelectLocation = (location: ParkingLocation) => {
    setSelectedLocation(location)
    if (location.polygon && map.current) {
      // Normalize polygon coordinates
      const coordinates = (location.polygon as any)?.coordinates
        ? (location.polygon as any).coordinates[0] // GeoJSON Polygon
        : location.polygon // Array of coords

      if (Array.isArray(coordinates) && coordinates.length > 0) {
        const lngs = coordinates.map((coord: any) => coord[0])
        const lats = coordinates.map((coord: any) => coord[1])
        const bounds = new mapboxgl.LngLatBounds(
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        )
        map.current.fitBounds(bounds, { padding: 50, duration: 1000 })
      }
    } else if (location.latitude && location.longitude && map.current) {
      map.current.flyTo({
        center: [parseFloat(location.longitude), parseFloat(location.latitude)],
        zoom: 18,
        duration: 1000,
      })
    }
  }

  const handleAddGenericAircraft = async () => {
    if (!map.current) return
    const center = map.current.getCenter()

    const tailNumber = `AC-${Math.floor(Math.random() * 10000)}`
    const metadata: GenericAircraftMetadata = {
      type: 'generic_aircraft',
      rotation: 310, // Face left (relative to screen with bearing 40)
      aircraftType: DEFAULT_AIRCRAFT_TYPE,
      tailNumber: tailNumber,
      color: '#ffffff'
    }

    try {
      const newLoc = await createLocationMutation.mutateAsync({
        location_code: tailNumber,
        description: JSON.stringify(metadata),
        latitude: center.lat.toFixed(6),
        longitude: center.lng.toFixed(6),
        airport: 'MSO',
        display_order: 1,
        polygon: null
      })

      if (newLoc) {
        setSelectedAircraftId(newLoc.id)
        setIsSheetOpen(true)
      }
    } catch (error) {
      console.error('Failed to create generic aircraft:', error)
    }
  }

  // Schedule a database save for an aircraft after a delay (debounced)
  const scheduleSave = (id: number, marker: mapboxgl.Marker) => {
    // Clear any existing save timeout for this aircraft
    if (savePendingRef.current.has(id)) {
      clearTimeout(savePendingRef.current.get(id)!)
    }

    setHasPendingSave(true)

    // Schedule save after 1.5 seconds of no movement
    const timeout = setTimeout(async () => {
      const aircraft = genericAircraftLocations.find(loc => loc.id === id)
      if (!aircraft) {
        savePendingRef.current.delete(id)
        setHasPendingSave(false)
        return
      }

      // Get current marker position (source of truth)
      const markerPos = marker.getLngLat()
      const markerRotation = marker.getRotation()

      // Get database position
      const dbLat = parseFloat(aircraft.latitude || '0')
      const dbLng = parseFloat(aircraft.longitude || '0')

      // Get metadata for rotation
      let metadata: GenericAircraftMetadata
      try {
        metadata = aircraft.description ? JSON.parse(aircraft.description) : {}
      } catch {
        metadata = {} as any
      }
      const dbRotation = metadata.rotation || 0

      // Check if marker position differs from database
      const threshold = 0.000001
      if (Math.abs(markerPos.lat - dbLat) > threshold ||
        Math.abs(markerPos.lng - dbLng) > threshold ||
        Math.abs(markerRotation - dbRotation) > 1) {
        // Save to database
        try {
          await handleUpdateAircraft(id, {
            coordinates: { x: markerPos.lng, y: markerPos.lat },
            rotation: markerRotation
          })
        } catch (err) {
          console.error('Failed to save aircraft position:', err)
        }
      }

      savePendingRef.current.delete(id)
      // Check if there are any other pending saves
      if (savePendingRef.current.size === 0) {
        setHasPendingSave(false)
      }
    }, 1500)

    savePendingRef.current.set(id, timeout)
  }

  const handleUpdateAircraft = async (id: number, updates: { tailNumber?: string; aircraftType?: string; rotation?: number; color?: string; coordinates?: { x: number; y: number } }) => {
    const loc = parkingLocations.find(l => l.id === id)
    if (!loc) return

    // Don't clear preview overrides here to prevent snapping.
    // We rely on the preview state for fluidity.
    // We can clear it when deselecting.

    let metadata: GenericAircraftMetadata
    try {
      metadata = loc.description ? JSON.parse(loc.description) : {}
    } catch (e) {
      metadata = {} as any
    }

    // Separate coordinates from metadata updates
    const { coordinates, ...metaUpdates } = updates

    const newMetadata = {
      ...metadata,
      ...metaUpdates
    }

    const updatePayload: any = {
      description: JSON.stringify(newMetadata)
    }

    if (coordinates) {
      updatePayload.longitude = coordinates.x.toFixed(6)
      updatePayload.latitude = coordinates.y.toFixed(6)
    }

    try {
      isSavingRef.current = true
      await updateLocationMutation.mutateAsync({
        id: loc.id,
        data: updatePayload
      })
    } catch (error) {
      console.error('Failed to update aircraft:', error)
      isSavingRef.current = false
    }
  }

  const handlePreviewAircraft = (id: number, updates: { tailNumber?: string; aircraftType?: string; rotation?: number; color?: string }) => {
    // Update the Ref immediately so it's available for any renders
    previewOverridesRef.current = {
      ...previewOverridesRef.current,
      [id]: { ...previewOverridesRef.current[id], ...updates }
    }

    // If rotation is updated, apply it directly to the marker for performance (avoid React render)
    if (updates.rotation !== undefined) {
      const marker = markersRef.current.get(id)
      if (marker) {
        marker.setRotation(updates.rotation)
      }
      // Do NOT set state for rotation to avoid re-rendering the entire map component on every mouse move
      // The AircraftSheet manages its own visual state during drag
    } else {
      // For other updates (color, type), we do want to trigger a render
      setPreviewOverrides(prev => ({
        ...prev,
        [id]: { ...prev[id], ...updates }
      }))
    }
  }

  const handleDeleteGenericAircraft = async (id: number) => {
    try {
      await deleteLocationMutation.mutateAsync(id)
    } catch (error) {
      console.error('Failed to delete aircraft:', error)
    }
  }

  // Keyboard Navigation for Selected Aircraft
  // Game Loop for Smooth Movement
  const keysPressed = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const pendingChangesRef = useRef<{ lat: number; lng: number; rotation: number } | null>(null)
  const isSavingRef = useRef<boolean>(false)
  const positionBeforeMoveRef = useRef<{ id: number; lat: number; lng: number; rotation: number } | null>(null)

  // Disable map keyboard events when an aircraft is selected to prevent map panning while moving aircraft
  useEffect(() => {
    if (!map.current) return

    if (selectedAircraftId) {
      map.current.keyboard.disable()
    } else {
      map.current.keyboard.enable()
    }

    return () => {
      if (map.current) map.current.keyboard.enable()
    }
  }, [selectedAircraftId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't prevent default if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      // Prevent arrow keys from scrolling the page
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }

      if (!selectedAircraftId) return

      if (e.key === 'Escape') {
        setIsSheetOpen(false)
        return
      }

      // Undo: Command+Z (Mac) or Ctrl+Z (Windows/Linux)
      if (((e.metaKey || e.ctrlKey) && e.key === 'z') && selectedAircraftId) {
        e.preventDefault()

        // Clear the position before move ref since we're undoing
        positionBeforeMoveRef.current = null

        // Get undo stack from localStorage
        const undoStack = JSON.parse(localStorage.getItem(`aircraft_${selectedAircraftId}_undo`) || '[]')
        const undoPosition = undoStack.pop()

        if (undoPosition && undoPosition.id === selectedAircraftId) {
          // Save updated undo stack back to localStorage
          localStorage.setItem(`aircraft_${selectedAircraftId}_undo`, JSON.stringify(undoStack))

          const marker = markersRef.current.get(selectedAircraftId)
          if (marker) {
            // Update marker position (marker is source of truth)
            marker.setLngLat([undoPosition.lng, undoPosition.lat])
            marker.setRotation(undoPosition.rotation)

            // Schedule database save after 1.5s delay
            scheduleSave(selectedAircraftId, marker)

            // Notify AircraftSheet of rotation change (side-channel)
            if (rotationSyncRef.current) {
              rotationSyncRef.current(undoPosition.rotation)
            }
          }
        }
        return
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Save position before first movement (for undo)
        if (keysPressed.current.size === 0 && selectedAircraftId) {
          const marker = markersRef.current.get(selectedAircraftId)
          if (marker) {
            const pos = marker.getLngLat()
            positionBeforeMoveRef.current = {
              id: selectedAircraftId,
              lat: pos.lat,
              lng: pos.lng,
              rotation: marker.getRotation()
            }
          }
        }

        keysPressed.current.add(e.key)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        keysPressed.current.delete(e.key)

        // If all keys are released and we have pending changes, save to undo stack
        if (keysPressed.current.size === 0 && pendingChangesRef.current && selectedAircraftIdRef.current) {
          const id = selectedAircraftIdRef.current

          // Save to undo stack in localStorage (for Command+Z)
          if (positionBeforeMoveRef.current && positionBeforeMoveRef.current.id === id) {
            const undoStack = JSON.parse(localStorage.getItem(`aircraft_${id}_undo`) || '[]')
            undoStack.push(positionBeforeMoveRef.current)

            // Limit undo stack to 20 entries
            if (undoStack.length > 20) {
              undoStack.shift()
            }

            localStorage.setItem(`aircraft_${id}_undo`, JSON.stringify(undoStack))
            positionBeforeMoveRef.current = null
          }

          pendingChangesRef.current = null

          // Schedule database save after 1.5s delay
          const marker = markersRef.current.get(id)
          if (marker) {
            // Update preview overrides to lock in the new position and prevent snapping
            // if the DB query returns stale data before the write is confirmed.
            const pos = marker.getLngLat()
            const rot = marker.getRotation()

            setPreviewOverrides(prev => ({
              ...prev,
              [id]: {
                ...prev[id],
                rotation: rot,
                lat: pos.lat,
                lng: pos.lng
              }
            }))

            scheduleSave(id, marker)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedAircraftId])


  // We need a way to access the *latest* position in the loop without triggering re-renders of the loop hook.
  // We can use a ref to store the latest previewOverrides.
  const latestPreviewOverrides = useRef(previewOverrides)

  useEffect(() => {
    latestPreviewOverrides.current = previewOverrides
  }, [previewOverrides])

  // Actual Movement Logic in a separate effect to avoid complex dependencies in the loop setup
  useEffect(() => {
    if (!selectedAircraftId) return

    const moveAircraft = () => {
      if (keysPressed.current.size === 0) return

      const id = selectedAircraftId
      const genericAircraft = parkingLocations.find(l => l.id === id)
      if (!genericAircraft) return

      // Get current values directly from the marker for real-time updates
      const marker = markersRef.current.get(id)
      if (!marker) return

      const currentPos = marker.getLngLat()
      let currentLat = currentPos.lat
      let currentLng = currentPos.lng
      let currentRotation = marker.getRotation()

      // Constants
      const moveStep = 0.000005; // Increased speed (was 0.0000015)
      const rotateStep = 4; // Increased rotation speed (was 2)

      let newRotation = currentRotation
      let newLat = currentLat
      let newLng = currentLng

      // Rotation
      if (keysPressed.current.has('ArrowLeft')) {
        newRotation -= rotateStep
      }
      if (keysPressed.current.has('ArrowRight')) {
        newRotation += rotateStep
      }
      // Normalize rotation
      if (newRotation < 0) newRotation += 360
      if (newRotation >= 360) newRotation -= 360

      // Movement
      // Calculate direction based on NEW rotation (tank controls usually turn then move, or turn while moving)
      // We use the map bearing to adjust if needed, but "Forward" is relative to the nose.
      // Nose is at `newRotation`.
      // Map projection adjustment:
      const latRad = newLat * Math.PI / 180
      // Angle in math (0 is East, counter-clockwise) vs Navigation (0 is North, clockwise)
      // Math Angle = 90 - Nav Angle
      const mathRad = (90 - newRotation) * Math.PI / 180

      const dLat = moveStep * Math.sin(mathRad)
      const dLng = (moveStep * Math.cos(mathRad)) / Math.cos(latRad)

      if (keysPressed.current.has('ArrowUp')) {
        newLat += dLat
        newLng += dLng
      }
      if (keysPressed.current.has('ArrowDown')) {
        newLat -= dLat
        newLng -= dLng
      }

      // Update marker directly for smooth 60fps movement (no React re-renders)
      if (marker) {
        marker.setLngLat([newLng, newLat])
        marker.setRotation(newRotation)

        // Notify AircraftSheet of rotation change (side-channel)
        if (rotationSyncRef.current) {
          rotationSyncRef.current(newRotation)
        }
      }

      // Store pending changes (will be synced to state and saved on keyup)
      pendingChangesRef.current = {
        lat: newLat,
        lng: newLng,
        rotation: newRotation
      }
    }

    const loop = () => {
      if (keysPressed.current.size > 0) {
        moveAircraft()
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [selectedAircraftId, parkingLocations]) // Dependencies

  const handleSetDefaultView = () => {
    if (!map.current) return
    const center = map.current.getCenter()
    const zoom = map.current.getZoom()
    const bearing = map.current.getBearing()

    localStorage.setItem(STORAGE_KEYS.CENTER_LAT, center.lat.toString())
    localStorage.setItem(STORAGE_KEYS.CENTER_LNG, center.lng.toString())
    localStorage.setItem(STORAGE_KEYS.ZOOM, zoom.toString())
    localStorage.setItem(STORAGE_KEYS.BEARING, bearing.toString())

    setContextMenu(null)
    console.log('Default View Settings:', JSON.stringify({
      center: [center.lng, center.lat],
      zoom: zoom,
      bearing: bearing
    }, null, 2))
  }

  const handleVerifyData = () => {
    const dbCount = parkingLocations.length
    // Count generic aircraft markers (managed by React/Mapbox markers)
    // Note: This might need adjustment if we use different marker classes
    // Currently we use `markersRef` for generic aircraft.
    const markerCount = markersRef.current.size

    // If we have other markers (real flights), we should count them too if they are in parkingLocations
    // But currently parkingLocations mixes both? No, parkingLocations are just the parked ones.

    if (dbCount === markerCount) {
      alert(`Integrity Check Passed: ${dbCount} aircraft in DB, ${markerCount} on map.`)
    } else {
      alert(`Integrity Check FAILED: ${dbCount} aircraft in DB, but ${markerCount} on map!`)
      console.error('Missing Aircraft:', parkingLocations.filter(l => !markersRef.current.has(l.id)))
    }
  }

  // Derive selected aircraft with preview overrides for real-time updates
  const selectedAircraftRaw = parkingLocations.find(l => l.id === selectedAircraftId)
  let selectedAircraftProps = null

  if (selectedAircraftRaw) {
    let metadata: GenericAircraftMetadata
    try {
      metadata = selectedAircraftRaw.description ? JSON.parse(selectedAircraftRaw.description) : {}
    } catch (e) {
      metadata = {} as any
    }

    const preview = previewOverrides[selectedAircraftRaw.id]

    selectedAircraftProps = {
      id: selectedAircraftRaw.id,
      rotation: preview?.rotation ?? metadata.rotation ?? 0,
      aircraftType: preview?.aircraftType ?? metadata.aircraftType ?? DEFAULT_AIRCRAFT_TYPE,
      tailNumber: preview?.tailNumber ?? metadata.tailNumber ?? selectedAircraftRaw.location_code,
      color: preview?.color ?? metadata.color ?? '#ffffff'
    }
  }

  // Side-channel for rotation sync (Map -> Sheet)
  const rotationSyncRef = useRef<((rotation: number) => void) | null>(null)

  return (
    <div className="relative w-full h-full flex" style={{ minHeight: '500px' }}>
      {/* Sidebar - Config Mode Only (Shelved polygon drawing, but keeping list for reference if needed) */}
      {configMode && isAdmin && (
        <div className="w-80 border-r bg-background flex-shrink-0 overflow-hidden">
          <ParkingLocationPanel
            locations={parkingLocations as any}
            onCreateLocation={async (data) => {
              await createLocationMutation.mutateAsync(data)
            }}
            onUpdateLocation={async (id, data) => {
              await updateLocationMutation.mutateAsync({ id, data })
            }}
            onDeleteLocation={async (id) => {
              await deleteLocationMutation.mutateAsync(id)
            }}
            onSelectLocation={handleSelectLocation}
            selectedLocationId={selectedLocation?.id}
          />
        </div>
      )}

      {/* Map Container */}
      <div className="relative w-full h-full flex flex-col">
        {/* Saving Indicator */}
        {(isMutating > 0 || hasPendingSave) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-yellow-500/90 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg backdrop-blur-sm animate-pulse flex items-center gap-2 pointer-events-none">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
            Saving...
          </div>
        )}

        {/* Loading Indicator */}
        {isParkingLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-500/90 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg backdrop-blur-sm animate-pulse flex items-center gap-2 pointer-events-none">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
            Loading...
          </div>
        )}

        <div ref={mapContainer} className="flex-1 w-full relative" style={{ width: '100%', height: '100%' }} />

        {/* Fixed Red Reference Line - Only in Config Mode */}
        {configMode && (
          <div
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{
              top: '125px',
              borderTop: '2px dashed red',
              opacity: 0.7
            }}
          />
        )}

        {/* Generic Aircraft Controls - Only in Operations Mode */}
        {!configMode && (
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            <Button onClick={handleAddGenericAircraft} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md select-none">
              <Plus className="w-4 h-4 mr-2" />
              Add Airplane
            </Button>
          </div>
        )}

        {/* Aircraft Sheet Drawer */}
        <AircraftSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          aircraft={selectedAircraftProps}
          onUpdate={handleUpdateAircraft}
          onPreview={handlePreviewAircraft}
          onDelete={handleDeleteGenericAircraft}
          mapRotation={currentBearing}
          rotationSyncRef={rotationSyncRef}
        />

        {/* Rotation Control - Only in Config Mode */}
        {configMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-background/95 backdrop-blur px-4 py-2 rounded-lg shadow-lg border space-y-2 z-50">
            {isAdmin && selectedLocation && (
              <>
                <p className="text-sm font-medium">
                  Drawing for: {selectedLocation.location_code}
                </p>
                <p className="text-xs text-muted-foreground">
                  Click polygon tool, click on map to draw boundaries,
                  double-click to finish
                </p>
              </>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Map Rotation:</span>
              <input
                type="range"
                min="0"
                max="360"
                value={currentBearing}
                className="w-32"
                onChange={(e) => {
                  const bearing = parseInt(e.target.value)
                  setCurrentBearing(bearing)
                  if (map.current) {
                    map.current.setBearing(bearing)
                  }
                }}
              />
              <span className="text-muted-foreground w-16 font-mono font-bold">{currentBearing}°</span>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  if (map.current) {
                    // Toggle between North Up (0) and Map Up (320)
                    const target = Math.abs(currentBearing - 320) < 5 ? 0 : 320
                    map.current.easeTo({ bearing: target, duration: 1000 })
                    setCurrentBearing(target)
                  }
                }}
                title="Toggle Bearing (0° / 320°)"
              >
                <div className="text-[10px] font-bold">N</div>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Config: ON | Admin: {isAdmin ? 'YES' : 'NO'}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-6"
              onClick={handleVerifyData}
            >
              Verify Map Data
            </Button>
          </div>
        )}

        {/* Legend */}
        {/* TODO: Put back in later
        <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur p-4 rounded-lg shadow-lg border">
          <h3 className="font-semibold mb-2 text-sm">Legend</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#088] opacity-20 border-2 border-[#088]"></div>
              <span>Parking Location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs">
                ✈
              </div>
              <span>Aircraft (drag to move)</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              <div>• Icon size reflects aircraft size</div>
              <div>• Multiple aircraft at same location are stacked</div>
              {!configMode && <div>• Drag aircraft to reassign parking</div>}
            </div>
          </div>
        </div>
        */}
      </div>
      {/* Context Menu */}
      {
        contextMenu && (
          <div
            className="absolute z-50 bg-popover text-popover-foreground border rounded-md shadow-md p-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
              onClick={handleSetDefaultView}
            >
              Set as Default View
            </button>
          </div>
        )
      }
    </div >
  )
}
