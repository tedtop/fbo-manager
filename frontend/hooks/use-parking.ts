'use client'

import { aircraftKeys } from '@/hooks/use-aircraft'
import type { GeoJsonPolygon } from '@/lib/parking-geometry'
import { type ParkedPlane, toParkedPlane } from '@/lib/parking-map'
import { createClient } from '@/lib/supabase/client'
import {
  type AircraftInsert,
  createAircraft,
  findAllAircraft,
  findParkedAircraft
} from '@/repositories/aircraft.repo'
import type {
  ParkingAreaInsert,
  ParkingAreaRow,
  ParkingAreaUpdate
} from '@/repositories/parking-area.repo'
import {
  addArea,
  archiveArea,
  editArea,
  listAreas,
  placeAircraft,
  unparkAircraft
} from '@/services/parking.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'

export const parkingKeys = {
  areas: ['parking-areas'] as const,
  parked: ['parked-aircraft'] as const
}

const POLL_MS = 15_000

export type PlaceRequest = {
  tailNumber: string
  lat: number
  lng: number
  heading: number
}

/** Queries and mutations for the ramp map: areas, parked planes and the aircraft list. */
export function useParking() {
  const qc = useQueryClient()
  const db = useMemo(() => createClient(), [])

  const areasQuery = useQuery({
    queryKey: parkingKeys.areas,
    queryFn: () => listAreas(db),
    refetchInterval: POLL_MS
  })
  const parkedQuery = useQuery({
    queryKey: parkingKeys.parked,
    queryFn: () => findParkedAircraft(db),
    refetchInterval: POLL_MS
  })
  const aircraftQuery = useQuery({
    queryKey: aircraftKeys.lists(),
    queryFn: () => findAllAircraft(db)
  })

  const areas = areasQuery.data ?? []
  // placeAircraft resolves the containing area from the latest areas, even when a debounced
  // save fires after the areas changed.
  const areasRef = useRef<ParkingAreaRow[]>(areas)
  areasRef.current = areas

  const parked = useMemo<ParkedPlane[]>(
    () =>
      (parkedQuery.data ?? []).flatMap((row) => {
        const plane = toParkedPlane(row)
        return plane ? [plane] : []
      }),
    [parkedQuery.data]
  )

  const invalidateAreas = () =>
    qc.invalidateQueries({ queryKey: parkingKeys.areas })
  const invalidatePlanes = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: parkingKeys.parked }),
      qc.invalidateQueries({ queryKey: aircraftKeys.all })
    ])

  const addAreaMutation = useMutation({
    mutationFn: (area: ParkingAreaInsert) => addArea(db, area),
    onSuccess: invalidateAreas
  })
  const editAreaMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: ParkingAreaUpdate }) =>
      editArea(db, id, updates),
    onSuccess: invalidateAreas
  })
  const archiveAreaMutation = useMutation({
    mutationFn: (id: number) => archiveArea(db, id),
    // Planes keep their coordinates; the UI derives membership from the active areas.
    onSuccess: invalidateAreas
  })
  const placeMutation = useMutation({
    mutationFn: ({ tailNumber, lat, lng, heading }: PlaceRequest) =>
      placeAircraft(db, tailNumber, lat, lng, heading, areasRef.current),
    onSuccess: invalidatePlanes
  })
  const unparkMutation = useMutation({
    mutationFn: (tailNumber: string) => unparkAircraft(db, tailNumber),
    onSuccess: invalidatePlanes
  })
  const createAircraftMutation = useMutation({
    mutationFn: (aircraft: AircraftInsert) => createAircraft(db, aircraft),
    onSuccess: () => qc.invalidateQueries({ queryKey: aircraftKeys.all })
  })

  return {
    areas,
    areasLoading: areasQuery.isLoading,
    areasError: areasQuery.error,
    parked,
    parkedError: parkedQuery.error,
    aircraft: aircraftQuery.data ?? [],
    addArea: addAreaMutation.mutateAsync,
    editArea: (id: number, updates: ParkingAreaUpdate) =>
      editAreaMutation.mutateAsync({ id, updates }),
    /** Replaces the area's single polygon; null clears it. */
    setBoundary: (id: number, polygon: GeoJsonPolygon | null) =>
      editAreaMutation.mutateAsync({ id, updates: { polygon } }),
    archiveArea: archiveAreaMutation.mutateAsync,
    place: placeMutation.mutateAsync,
    unpark: unparkMutation.mutateAsync,
    createAircraft: createAircraftMutation.mutateAsync
  }
}
