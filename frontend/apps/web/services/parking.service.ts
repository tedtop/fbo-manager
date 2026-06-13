import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  createParkingLocation,
  softDeleteParkingLocation,
  updateParkingLocation,
  type ParkingLocationInsert,
  type ParkingLocationUpdate
} from '@/repositories/parking.repo'

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
