import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { findAreaAtPoint } from '@/lib/parking-geometry'
import {
  clearAircraftPosition,
  setAircraftPosition,
  type AircraftRow,
} from '@/repositories/aircraft.repo'
import {
  archiveParkingArea,
  createParkingArea,
  findAllParkingAreas,
  updateParkingArea,
  type ParkingAreaInsert,
  type ParkingAreaRow,
  type ParkingAreaUpdate,
} from '@/repositories/parking-area.repo'

export async function listAreas(
  db: SupabaseClient<Database>,
  options: { includeInactive?: boolean } = {}
): Promise<ParkingAreaRow[]> {
  return findAllParkingAreas(db, options)
}

export async function addArea(
  db: SupabaseClient<Database>,
  area: ParkingAreaInsert
): Promise<ParkingAreaRow> {
  return createParkingArea(db, area)
}

export async function editArea(
  db: SupabaseClient<Database>,
  id: number,
  updates: ParkingAreaUpdate
): Promise<ParkingAreaRow> {
  return updateParkingArea(db, id, updates)
}

export async function archiveArea(db: SupabaseClient<Database>, id: number): Promise<void> {
  await archiveParkingArea(db, id)
}

/**
 * Parks an aircraft at an exact position. The containing area (smallest wins when areas
 * nest) is resolved from `areas`; a position outside every area is stored with no area.
 */
export async function placeAircraft(
  db: SupabaseClient<Database>,
  tailNumber: string,
  lat: number,
  lng: number,
  heading: number,
  areas: readonly ParkingAreaRow[]
): Promise<AircraftRow> {
  const area = findAreaAtPoint([lng, lat], areas)
  return setAircraftPosition(db, tailNumber, { lat, lng, heading, areaId: area?.id ?? null })
}

export async function unparkAircraft(
  db: SupabaseClient<Database>,
  tailNumber: string
): Promise<AircraftRow> {
  return clearAircraftPosition(db, tailNumber)
}
