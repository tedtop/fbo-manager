import {
  type ParkingLocationInsert,
  type ParkingLocationUpdate,
  createParkingLocation,
  softDeleteParkingLocation,
  updateParkingLocation
} from '@/repositories/parking.repo'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function archiveParkingLocation(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  await softDeleteParkingLocation(db, id)
}

export async function addParkingLocation(
  db: SupabaseClient<Database>,
  location: ParkingLocationInsert
) {
  return createParkingLocation(db, location)
}

export async function editParkingLocation(
  db: SupabaseClient<Database>,
  id: number,
  updates: ParkingLocationUpdate
) {
  return updateParkingLocation(db, id, updates)
}
