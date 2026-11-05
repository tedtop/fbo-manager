// Cypress tasks for the equipment specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const equipmentTasks = {
  /** equipment row for an equipment_id (null if none): the proof the form really persisted. */
  async getEquipmentById(equipmentId: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('equipment').select('*').eq('equipment_id', equipmentId).maybeSingle()
    if (error) throw new Error(`getEquipmentById: ${error.message}`)
    return data ?? null
  },

  /** Inserts a bare fuel-truck equipment row so the edit scenario has a card to edit. */
  async seedEquipment({ equipmentId, name }: { equipmentId: string; name: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('equipment').insert({ equipment_id: equipmentId, equipment_name: name, equipment_type: 'fuel_truck' })
    if (error) throw new Error(`seedEquipment: ${error.message}`)
    return null
  },

  /** Removes the equipment rows created by a spec. */
  async cleanEquipment(equipmentIds: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('equipment').delete().in('equipment_id', equipmentIds)
    if (error) throw new Error(`cleanEquipment: ${error.message}`)
    return null
  },
}
