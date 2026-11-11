// Cypress tasks for the Fuel Farm specs. Use createE2EDbClient() from './db' (service role, local stack only).
// Only fbo-owned rows are written (a spec-owned fuel_tank and its readings); tank_level_min is never touched.
import { createE2EDbClient } from './db'

export const fuelFarmTasks = {
  /** A spec-owned tank with one reading per entry ({ level, recordedAt }). */
  async seedTankWithReadings({
    tankId,
    readings
  }: {
    tankId: string
    readings: { level: number; recordedAt: string }[]
  }) {
    const db = createE2EDbClient()
    const { error } = await db.from('fuel_tank').insert({
      tank_id: tankId,
      tank_name: `Cy ${tankId}`,
      fuel_type: 'jet_a',
      capacity_gallons: 12000,
      min_level_inches: 1,
      max_level_inches: 114,
      usable_min_inches: 14,
      usable_max_inches: 93
    })
    if (error) throw new Error(`seedTankWithReadings: ${error.message}`)
    if (readings.length) {
      const { error: rErr } = await db
        .from('tank_level_readings')
        .insert(readings.map((r) => ({ tank_id: tankId, level: r.level, recorded_at: r.recordedAt })))
      if (rErr) throw new Error(`seedTankWithReadings readings: ${rErr.message}`)
    }
    return null
  },

  /** fuel_tank_level_override row for a tank (null if none). */
  async getTankLevelOverride(tankId: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('fuel_tank_level_override').select('*').eq('tank_id', tankId).maybeSingle()
    if (error) throw new Error(`getTankLevelOverride: ${error.message}`)
    return data ?? null
  },

  /** Removes a spec-owned tank, its readings and its override. */
  async cleanTank(tankId: string) {
    const db = createE2EDbClient()
    await db.from('fuel_tank_level_override').delete().eq('tank_id', tankId)
    await db.from('tank_level_readings').delete().eq('tank_id', tankId)
    await db.from('tank_level_min').delete().eq('tank_id', tankId)
    const { error } = await db.from('fuel_tank').delete().eq('tank_id', tankId)
    if (error) throw new Error(`cleanTank: ${error.message}`)
    return null
  }
}
