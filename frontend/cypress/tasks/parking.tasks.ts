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

  /** Inserts an aircraft already parked on the ramp (position + heading, no area). */
  async seedParkedAircraft({
    tail,
    typeIcao,
    typeDisplay,
    lat,
    lng,
    heading,
  }: {
    tail: string
    typeIcao: string
    typeDisplay: string
    lat: number
    lng: number
    heading: number
  }) {
    const db = createE2EDbClient()
    const { error } = await db.from('aircraft').insert({
      tail_number: tail,
      aircraft_type_icao: typeIcao,
      aircraft_type_display: typeDisplay,
      parked_lat: lat,
      parked_lng: lng,
      parked_heading: heading,
      parked_at: new Date().toISOString(),
    })
    if (error) throw new Error(`seedParkedAircraft: ${error.message}`)
    return null
  },

  /** Saved position and heading of a parked aircraft (null when the aircraft is missing). */
  async getParkedPose(tail: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('aircraft').select('parked_lat, parked_lng, parked_heading').eq('tail_number', tail).maybeSingle()
    if (error) throw new Error(`getParkedPose: ${error.message}`)
    if (!data) return null
    return { lat: Number(data.parked_lat), lng: Number(data.parked_lng), heading: data.parked_heading }
  },

  /** Removes the aircraft seeded for the given tails. */
  async cleanParkedAircraft(tails: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('aircraft').delete().in('tail_number', tails)
    if (error) throw new Error(`cleanParkedAircraft: ${error.message}`)
    return null
  },

  /** Removes the areas seeded for the given codes. */
  async cleanParkingAreas(codes: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('parking_area').delete().in('code', codes)
    if (error) throw new Error(`cleanParkingAreas: ${error.message}`)
    return null
  },
}
