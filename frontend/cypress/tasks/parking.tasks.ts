// Cypress tasks for the parking specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const parkingTasks = {
  /** Inserts one parking_area with a GeoJSON polygon (ring = closed [lng, lat] list). Returns its id. */
  async seedParkingArea({ code, name, ring }: { code: string; name: string; ring: number[][] }) {
    const db = createE2EDbClient()
    const { data, error } = await db
      .from('parking_area')
      .insert({ code, name, kind: 'other', polygon: { type: 'Polygon', coordinates: [ring] } })
      .select('id')
      .single()
    if (error) throw new Error(`seedParkingArea: ${error.message}`)
    return data.id
  },

  /** The outer ring saved in parking_area.polygon for a code (null when the area or polygon is missing). */
  async getParkingAreaRing(code: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('parking_area').select('polygon').eq('code', code).maybeSingle()
    if (error) throw new Error(`getParkingAreaRing: ${error.message}`)
    const polygon = data?.polygon as { coordinates?: number[][][] } | null | undefined
    return polygon?.coordinates?.[0] ?? null
  },

  /** Removes the areas seeded for the given codes. */
  async cleanParkingAreas(codes: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('parking_area').delete().in('code', codes)
    if (error) throw new Error(`cleanParkingAreas: ${error.message}`)
    return null
  },
}
