'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useParking } from '@/hooks/use-parking'
import { useToast } from '@/hooks/use-toast'
import { getAircraftDefinition } from '@/lib/aircraft-types'
import { findAreaAtPoint, polygonBounds, ringOf } from '@/lib/parking-geometry'
import {
  areaOfPlane,
  countAircraftByArea,
  headingForScreenDirection,
  roundCoordinate
} from '@/lib/parking-map'
import type { ParkingAreaRow } from '@/repositories/parking-area.repo'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import type mapboxgl from 'mapbox-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddAircraftSheet } from './add-aircraft-sheet'
import { AircraftSheet } from './aircraft-sheet'
import { syncAreaLayers } from './area-layers'
import { AreaPanel } from './area-panel'
import { type AreaFormValues, AreaSheet } from './area-sheet'
import { type Notice, useAreaDrawing } from './use-area-drawing'
import { useMapInstance } from './use-map-instance'
import { usePlaneMarkers } from './use-plane-markers'

interface ParkingMapProps {
  configMode: boolean
  isAdmin: boolean
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Unknown error'
}

export function ParkingMap({ configMode, isAdmin }: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    mapRef,
    loaded,
    bearing,
    error: mapError,
    saveDefaultView
  } = useMapInstance(containerRef)
  const parking = useParking()
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const editing = configMode && isAdmin

  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
  const [selectedTail, setSelectedTail] = useState<string | null>(null)
  const [planeSheetOpen, setPlaneSheetOpen] = useState(false)
  const [areaSheetOpen, setAreaSheetOpen] = useState(false)
  const [areaBeingEdited, setAreaBeingEdited] = useState<ParkingAreaRow | null>(
    null
  )
  const [addOpen, setAddOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ParkingAreaRow | null>(
    null
  )
  const [clearTarget, setClearTarget] = useState<ParkingAreaRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  const reportError = useCallback(
    (title: string, err: unknown) => {
      setNotice({ kind: 'error', text: `${title}: ${errorMessage(err)}` })
      toast({
        title,
        description: errorMessage(err),
        variant: 'destructive'
      })
    },
    [toast]
  )

  useEffect(() => {
    if (notice?.kind !== 'success') return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const selectedArea =
    parking.areas.find((a) => a.id === selectedAreaId) ?? null

  // --- areas on the map, drawing --------------------------------------------------------

  const drawing = useAreaDrawing({
    mapRef,
    loaded,
    enabled: editing,
    area: selectedArea,
    onSave: async (id, polygon) => {
      await parking.setBoundary(id, polygon)
    },
    onNotice: setNotice
  })

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const highlighted = editing ? selectedAreaId : null
    syncAreaLayers(
      map,
      parking.areas,
      highlighted,
      drawing.mode === 'idle' ? null : highlighted
    )
  }, [mapRef, loaded, parking.areas, editing, selectedAreaId, drawing.mode])

  // Leaving config mode clears the area selection.
  useEffect(() => {
    if (!editing) setSelectedAreaId(null)
  }, [editing])

  // The map changes size when the mobile drawer or the side panel appears.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize is the point of these dependencies
  useEffect(() => {
    mapRef.current?.resize()
  }, [mapRef, editing, isMobile, drawerOpen])

  // --- planes -----------------------------------------------------------------------------

  const handleSelectPlane = useCallback(
    (tail: string | null, { open }: { open: boolean }) => {
      if (editing) return
      setSelectedTail(tail)
      if (tail === null) setPlaneSheetOpen(false)
      else if (open) setPlaneSheetOpen(true)
    },
    [editing]
  )

  const markers = usePlaneMarkers({
    mapRef,
    loaded,
    planes: parking.parked,
    interactive: !editing,
    selectedTail,
    onSelect: handleSelectPlane,
    onPersist: async (tail, pose) => {
      await parking.place({ tailNumber: tail, ...pose })
    },
    onSaveError: (tail, err) =>
      reportError(`Could not save the position of ${tail}`, err)
  })

  // Config mode is for areas only; planes stay visible but cannot be picked.
  useEffect(() => {
    if (editing) {
      setSelectedTail(null)
      setPlaneSheetOpen(false)
    }
  }, [editing])

  const parkedTails = useMemo(
    () => new Set(parking.parked.map((p) => p.tailNumber)),
    [parking.parked]
  )

  // A plane removed elsewhere (or by Remove from ramp) drops out of the selection.
  useEffect(() => {
    if (
      selectedTail &&
      !parkedTails.has(selectedTail) &&
      !parking.parkedError
    ) {
      setSelectedTail(null)
      setPlaneSheetOpen(false)
    }
  }, [selectedTail, parkedTails, parking.parkedError])

  const selectedPlane = useMemo(() => {
    const plane = parking.parked.find((p) => p.tailNumber === selectedTail)
    return plane ? { ...plane, ...markers.selectedPose } : null
  }, [parking.parked, selectedTail, markers.selectedPose])

  const planeAreaLabel = useMemo(() => {
    if (!selectedPlane) return null
    const area = areaOfPlane(selectedPlane, parking.areas)
    return area ? `${area.code} - ${area.name}` : null
  }, [selectedPlane, parking.areas])

  const counts = useMemo(
    () => countAircraftByArea(parking.areas, parking.parked),
    [parking.areas, parking.parked]
  )

  const placeAtMapCentre = async (tailNumber: string) => {
    const map = mapRef.current
    if (!map) throw new Error('The map is not ready yet.')
    const centre = map.getCenter()
    await parking.place({
      tailNumber,
      lat: roundCoordinate(centre.lat),
      lng: roundCoordinate(centre.lng),
      heading: headingForScreenDirection(270, map.getBearing())
    })
    setSelectedTail(tailNumber)
    setPlaneSheetOpen(false)
    setNotice({
      kind: 'success',
      text: `${tailNumber} is on the ramp at the centre of the map. Drag it into position.`
    })
  }

  const createAndPlace = async (tailNumber: string, typeId: string) => {
    await parking.createAircraft({
      tail_number: tailNumber,
      aircraft_type_icao: typeId,
      aircraft_type_display: getAircraftDefinition(typeId).name,
      airline_icao: '',
      fleet_id: ''
    })
    await placeAtMapCentre(tailNumber)
  }

  const removeSelectedPlane = async () => {
    if (!selectedTail) return
    const tail = selectedTail
    setRemoving(true)
    try {
      // Write any move still waiting for its debounce, so it cannot re-park the plane.
      await markers.flushPending(tail)
      await parking.unpark(tail)
      setSelectedTail(null)
      setPlaneSheetOpen(false)
      setNotice({ kind: 'success', text: `${tail} removed from the ramp.` })
    } catch (err) {
      reportError(`Could not remove ${tail} from the ramp`, err)
    } finally {
      setRemoving(false)
    }
  }

  // --- areas ------------------------------------------------------------------------------

  const openAreaSheet = (area: ParkingAreaRow | null) => {
    setAreaBeingEdited(area)
    setAreaSheetOpen(true)
  }

  const submitArea = async (values: AreaFormValues) => {
    if (areaBeingEdited) {
      await parking.editArea(areaBeingEdited.id, values)
      setNotice({ kind: 'success', text: `${values.code} updated.` })
      return
    }
    const created = await parking.addArea(values)
    setSelectedAreaId(created.id)
    setDrawerOpen(true)
    setNotice({
      kind: 'success',
      text: `${created.code} created. Press Draw boundary to outline it on the map.`
    })
  }

  const selectArea = (area: ParkingAreaRow) => {
    setSelectedAreaId(area.id)
    const map = mapRef.current
    const ring = ringOf(area.polygon)
    if (map && ring) {
      const [west, south, east, north] = polygonBounds(ring)
      map.fitBounds(
        [
          [west, south],
          [east, north]
        ],
        { padding: 60, duration: 800 }
      )
    }
  }

  const confirmArchive = async () => {
    const area = archiveTarget
    setArchiveTarget(null)
    if (!area) return
    try {
      await parking.archiveArea(area.id)
      setSelectedAreaId((current) => (current === area.id ? null : current))
      setNotice({ kind: 'success', text: `${area.code} archived.` })
    } catch (err) {
      reportError(`Could not archive ${area.code}`, err)
    }
  }

  const confirmClearBoundary = async () => {
    const area = clearTarget
    setClearTarget(null)
    if (!area) return
    drawing.finish()
    try {
      await parking.setBoundary(area.id, null)
      setNotice({
        kind: 'success',
        text: `Boundary for ${area.code} cleared.`
      })
    } catch (err) {
      reportError(`Could not clear the boundary for ${area.code}`, err)
    }
  }

  const startDrawing = () => {
    setDrawerOpen(false)
    drawing.startDraw()
  }
  const startEditingShape = () => {
    setDrawerOpen(false)
    drawing.startEdit()
  }

  // --- map-level interaction ----------------------------------------------------------------

  const live = useRef({ editing, drawMode: drawing.mode, areas: parking.areas })
  live.current = { editing, drawMode: drawing.mode, areas: parking.areas }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      setContextMenu(null)
      const target = e.originalEvent.target as HTMLElement | null
      if (target?.closest('.parking-plane')) return
      const { editing: isEditing, drawMode, areas } = live.current
      if (isEditing) {
        if (drawMode !== 'idle') return
        const area = findAreaAtPoint([e.lngLat.lng, e.lngLat.lat], areas)
        if (area) setSelectedAreaId(area.id)
      } else {
        setSelectedTail(null)
        setPlaneSheetOpen(false)
      }
    }
    const onContextMenu = (e: mapboxgl.MapMouseEvent) => {
      e.preventDefault()
      setContextMenu({ x: e.point.x, y: e.point.y })
    }
    const closeMenu = () => setContextMenu(null)

    map.on('click', onClick)
    map.on('contextmenu', onContextMenu)
    map.on('movestart', closeMenu)
    return () => {
      map.off('click', onClick)
      map.off('contextmenu', onContextMenu)
      map.off('movestart', closeMenu)
    }
  }, [mapRef, loaded])

  const setDefaultView = () => {
    setContextMenu(null)
    setNotice(
      saveDefaultView()
        ? { kind: 'success', text: 'Default view saved for this browser.' }
        : { kind: 'error', text: 'Could not save the default view.' }
    )
  }

  const loadError = parking.areasError ?? parking.parkedError
  const panel = (
    <AreaPanel
      areas={parking.areas}
      counts={counts}
      selectedId={selectedAreaId}
      loading={parking.areasLoading}
      drawMode={drawing.mode}
      onSelect={selectArea}
      onNew={() => openAreaSheet(null)}
      onEdit={(area) => openAreaSheet(area)}
      onArchive={setArchiveTarget}
      onDraw={startDrawing}
      onEditShape={startEditingShape}
      onFinishDrawing={drawing.finish}
      onClearBoundary={() => selectedArea && setClearTarget(selectedArea)}
    />
  )

  return (
    <div className="flex h-full min-h-[480px] w-full overflow-hidden">
      {editing && !isMobile && (
        <aside className="w-80 shrink-0 border-r border-border bg-background">
          {panel}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {/* mapbox-gl.css forces .mapboxgl-map to position:relative, so the absolute
              positioning lives on a wrapper and the map div just fills it */}
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" />
          </div>

          {mapError && (
            <div
              role="alert"
              className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-destructive"
            >
              {mapError}
            </div>
          )}

          {markers.pending > 0 && (
            <output className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1 text-sm font-semibold text-black shadow-lg">
              Saving...
            </output>
          )}

          {!editing && (
            <div className="absolute top-3 left-3 z-10">
              <Button onClick={() => setAddOpen(true)} className="shadow-md">
                <Plus className="mr-2 size-4" />
                Add airplane
              </Button>
            </div>
          )}

          {editing && (
            <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <label htmlFor="map-rotation" className="text-muted-foreground">
                Map rotation
              </label>
              <input
                id="map-rotation"
                type="range"
                min={0}
                max={360}
                value={bearing}
                className="w-24 sm:w-32"
                onChange={(e) =>
                  mapRef.current?.setBearing(Number(e.target.value))
                }
              />
              <span className="w-10 font-mono font-bold tabular-nums">
                {bearing}°
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  mapRef.current?.easeTo({ bearing: 0, duration: 800 })
                }
                title="Rotate the map so north is up"
              >
                N up
              </Button>
            </div>
          )}

          <div className="absolute inset-x-3 bottom-3 z-10 space-y-2">
            {loadError && (
              <div
                role="alert"
                className="rounded-md border border-destructive bg-background px-3 py-2 text-sm text-destructive shadow-md"
              >
                Could not load ramp data: {errorMessage(loadError)}
              </div>
            )}
            {notice && (
              <div
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={
                  notice.kind === 'error'
                    ? 'flex items-start justify-between gap-3 rounded-md border border-destructive bg-background px-3 py-2 text-sm text-destructive shadow-md'
                    : 'flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-md'
                }
              >
                <span>{notice.text}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="shrink-0 text-xs underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {contextMenu && (
            <div
              className="absolute z-30 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                type="button"
                className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={setDefaultView}
              >
                Set as Default View
              </button>
            </div>
          )}
        </div>

        {editing && isMobile && (
          <div className="border-t border-border bg-background">
            <button
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-expanded={drawerOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
            >
              Areas ({parking.areas.length})
              {drawerOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </button>
            {drawerOpen && <div className="h-[45vh]">{panel}</div>}
          </div>
        )}
      </div>

      <AreaSheet
        open={areaSheetOpen}
        onOpenChange={setAreaSheetOpen}
        area={areaBeingEdited}
        onSubmit={submitArea}
      />

      <AddAircraftSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        available={parking.aircraft.filter(
          (a) => !parkedTails.has(a.tail_number)
        )}
        knownTailNumbers={new Set(parking.aircraft.map((a) => a.tail_number))}
        onPlaceExisting={placeAtMapCentre}
        onCreateAndPlace={createAndPlace}
      />

      <AircraftSheet
        open={planeSheetOpen && selectedPlane !== null}
        onOpenChange={setPlaneSheetOpen}
        plane={selectedPlane}
        areaLabel={planeAreaLabel}
        mapBearing={bearing}
        removing={removing}
        onHeadingChange={(heading) =>
          selectedTail && markers.setHeading(selectedTail, heading)
        }
        onRemove={removeSelectedPlane}
      />

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.name} disappears from the map and the area list.
              Aircraft parked there keep their positions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearTarget !== null}
        onOpenChange={(open) => !open && setClearTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear the boundary of {clearTarget?.code}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The area stays in the list but has no shape on the map until you
              draw it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearBoundary}>
              Clear boundary
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
