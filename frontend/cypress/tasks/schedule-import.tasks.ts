// Cypress tasks for the schedule-import specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient, waitForDbRow } from './db'

function undatedOriginalsDir() {
  const day = new Date().toISOString().slice(0, 10)
  return `schedule_sheet/${day.slice(0, 4)}/${day.slice(5, 7)}/${day}/original`
}

async function listUndatedOriginals(db: ReturnType<typeof createE2EDbClient>) {
  const { data, error } = await db.storage.from('scans').list(undatedOriginalsDir(), { limit: 100 })
  if (error) throw new Error(`listScheduleSheetOriginals: ${error.message}`)
  return data ?? []
}

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

  /** Original sheet files kept in the private `scans` bucket for sheets without a printed date (folder of the scan day, UTC). */
  async listScheduleSheetOriginals() {
    return (await listUndatedOriginals(createE2EDbClient())).map((o) => o.name)
  },

  /** Removes those files so a run starts clean (the test file's bytes always hash to the same name). */
  async removeScheduleSheetOriginals() {
    const db = createE2EDbClient()
    const dir = undatedOriginalsDir()
    const names = (await listUndatedOriginals(db)).map((o) => `${dir}/${o.name}`)
    if (names.length > 0) await db.storage.from('scans').remove(names)
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
