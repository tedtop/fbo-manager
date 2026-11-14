import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { findAreaAtPoint, recomputeParkedAreas } from '@/lib/parking-geometry'
import {
  clearAircraftPosition,
  findParkedAircraft,
  setAircraftArea,
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

/**
 * Outcome of a change that is saved first and then re-resolves parked planes. The save itself
 * throws on failure; `recomputeFailed` means it was saved but the planes' areas were not updated.
 */
export type RecomputeOutcome = { recomputeFailed: boolean }

async function recomputeAfterSave(db: SupabaseClient<Database>): Promise<RecomputeOutcome> {
  try {
    await refreshParkedAreas(db)
    return { recomputeFailed: false }
  } catch {
    return { recomputeFailed: true }
  }
}

export async function editArea(
  db: SupabaseClient<Database>,
  id: number,
  updates: ParkingAreaUpdate
): Promise<RecomputeOutcome & { row: ParkingAreaRow }> {
  const row = await updateParkingArea(db, id, updates)
  const outcome = 'polygon' in updates ? await recomputeAfterSave(db) : { recomputeFailed: false }
  return { row, ...outcome }
}

/** Re-resolves parked_area_id of every parked plane against the active areas. */
export async function refreshParkedAreas(db: SupabaseClient<Database>): Promise<number> {
  const [areas, parked] = await Promise.all([findAllParkingAreas(db), findParkedAircraft(db)])
  const changes = recomputeParkedAreas(
    parked.flatMap((p) =>
      p.parked_lat === null || p.parked_lng === null
        ? []
        : [{ tailNumber: p.tail_number, lat: Number(p.parked_lat), lng: Number(p.parked_lng), areaId: p.parked_area_id }]
    ),
    areas
  )
  await Promise.all(changes.map((c) => setAircraftArea(db, c.tailNumber, c.areaId)))
  return changes.length
}

export async function archiveArea(db: SupabaseClient<Database>, id: number): Promise<RecomputeOutcome> {
  await archiveParkingArea(db, id)
  return recomputeAfterSave(db)
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
