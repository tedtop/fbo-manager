// Cypress tasks for the fuel dispatch / airline fuel sheet specs (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const fuelDispatchTasks = {
  /** The fuel_transaction saved for a QT dispatch id, with its truck meter readings (null when none). */
  async getAirlineFueling(qtDispatchId: string) {
    const db = createE2EDbClient()
    const { data, error } = await db
      .from('fuel_transaction')
      .select('*, readings:truck_meter_readings(*)')
      .eq('qt_dispatch_id', qtDispatchId)
      .eq('source', 'qt')
      .maybeSingle()
    if (error) throw new Error(`getAirlineFueling: ${error.message}`)
    return data
  },

  /** Removes the fueling saved for a QT dispatch id (its meter readings first), and any gap notes of the truck. */
  async cleanAirlineFueling(qtDispatchId: string) {
    const db = createE2EDbClient()
    const { data: txs, error } = await db.from('fuel_transaction').select('id').eq('qt_dispatch_id', qtDispatchId)
    if (error) throw new Error(`cleanAirlineFueling: ${error.message}`)
    const ids = (txs ?? []).map((t) => t.id)
    if (ids.length) {
      await db.from('truck_meter_readings').delete().in('fuel_transaction_id', ids)
      const { error: delErr } = await db.from('fuel_transaction').delete().in('id', ids)
      if (delErr) throw new Error(`cleanAirlineFueling delete: ${delErr.message}`)
    }
    return null
  }
}
