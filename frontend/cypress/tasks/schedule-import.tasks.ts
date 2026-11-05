// Cypress tasks for the schedule-import specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient, waitForDbRow } from './db'

export const scheduleImportTasks = {
  /** Removes flights and aircraft for the given tails (flights first: FK). */
  async cleanScheduleImport(tails: string[]) {
    const db = createE2EDbClient()
    const { error: flightError } = await db.from('flight').delete().in('tail_number', tails)
    if (flightError) throw new Error(`cleanScheduleImport: flight: ${flightError.message}`)
    const { error: aircraftError } = await db.from('aircraft').delete().in('tail_number', tails)
    if (aircraftError) throw new Error(`cleanScheduleImport: aircraft: ${aircraftError.message}`)
    return null
  },

  /** Waits until exactly `count` flights exist for the tails, then returns them (the import's proof of persistence). */
  async getImportedFlights({ tails, count }: { tails: string[]; count: number }) {
    const db = createE2EDbClient()
    return waitForDbRow(async () => {
      const { data } = await db.from('flight').select('*').in('tail_number', tails)
      return data && data.length === count ? data : null
    })
  },

  /** Aircraft rows for the tails. */
  async getAircraftRows(tails: string[]) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('aircraft').select('*').in('tail_number', tails)
    if (error) throw new Error(`getAircraftRows: ${error.message}`)
    return data ?? []
  },

  /** Service keys attached to one flight through flight_service. */
  async getFlightServiceKeysById(flightId: number) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('flight_service').select('flight_id, service:service_id(key)').eq('flight_id', flightId)
    if (error) throw new Error(`getFlightServiceKeysById: ${error.message}`)
    return ((data ?? []) as unknown as { service: { key: string } }[]).map((r) => r.service.key)
  },

  /** Number of flight rows for the tails. */
  async countFlightsForTails(tails: string[]) {
    const db = createE2EDbClient()
    const { count, error } = await db.from('flight').select('id', { count: 'exact', head: true }).in('tail_number', tails)
    if (error) throw new Error(`countFlightsForTails: ${error.message}`)
    return count ?? 0
  },
}
