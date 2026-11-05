// Cypress tasks for the truck sheet scan specs (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

const BUCKET = 'scans'

async function listAll(db: ReturnType<typeof createE2EDbClient>, dir: string): Promise<string[]> {
  const { data, error } = await db.storage.from(BUCKET).list(dir, { limit: 1000 })
  if (error) throw new Error(`list ${dir}: ${error.message}`)
  const out: string[] = []
  for (const item of data ?? []) {
    if (item.id === null) out.push(...(await listAll(db, `${dir}/${item.name}`)))
    else out.push(`${dir}/${item.name}`)
  }
  return out
}

export const truckSheetTasks = {
  /** Removes every truck sheet (readings and scan rows too) and the stored objects of one test truck and day, and the truck itself. */
  async resetTruckSheetScans({ truck, date }: { truck: string; date: string }) {
    const db = createE2EDbClient()
    const { data: sheets, error } = await db.from('truck_sheets').select('id').eq('truck_number', truck)
    if (error) throw new Error(`resetTruckSheetScans: ${error.message}`)
    const ids = (sheets ?? []).map((s) => s.id)
    if (ids.length > 0) {
      await db.from('scanned_documents').delete().in('truck_sheet_id', ids)
      await db.from('truck_sheets').delete().in('id', ids)
    }
    const dir = `truck_sheet/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/truck-${truck}`
    const objects = await listAll(db, dir)
    if (objects.length > 0) await db.storage.from(BUCKET).remove(objects)
    await db.from('equipment').delete().eq('equipment_id', truck)
    return null
  },

  /** Scan rows of a test truck's sheets, in page order, plus the number of sheet records. */
  async getTruckSheetScans(truck: string) {
    const db = createE2EDbClient()
    const { data: sheets } = await db.from('truck_sheets').select('id, page_count').eq('truck_number', truck)
    const ids = (sheets ?? []).map((s) => s.id)
    const { data: scans, error } = ids.length
      ? await db.from('scanned_documents').select('*').in('truck_sheet_id', ids).order('page_number')
      : { data: [], error: null }
    if (error) throw new Error(`getTruckSheetScans: ${error.message}`)
    return { sheets: sheets ?? [], scans: scans ?? [] }
  },
}
