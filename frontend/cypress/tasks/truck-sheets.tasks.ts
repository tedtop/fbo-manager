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

  /**
   * A fuel truck (equipment row) with one Jet A sheet for `date`: a header, two meter readings and one stored page
   * (a 1x1 PNG as page and thumbnail). For the equipment detail page. Undo with resetTruckSheetScans.
   */
  async seedTruckWithSheet({ truck, date }: { truck: string; date: string }) {
    const db = createE2EDbClient()
    const fail = (what: string, e: { message: string } | null) => {
      if (e) throw new Error(`seedTruckWithSheet ${what}: ${e.message}`)
    }
    const eq = await db
      .from('equipment')
      .insert({ equipment_id: truck, equipment_name: `E2E Fuel Truck ${truck}`, equipment_type: 'fuel_truck' })
      .select('id')
      .single()
    fail('equipment', eq.error)
    const sheet = await db
      .from('truck_sheets')
      .insert({
        sheet_date: date, fuel_truck_id: eq.data!.id, truck_number: truck, fuel_type: 'jet_a',
        starting_gallons: 3000, front_meter_start: 1000, rear_meter_start: 5000, fueler_initials: 'TT', page_count: 1,
      })
      .select('id')
      .single()
    fail('sheet', sheet.error)
    const readings = await db.from('truck_meter_readings').insert([
      { truck_sheet_id: sheet.data!.id, line_number: 1, reading_type: 'fueling', meter: 'front', meter_start: 1000, meter_end: 1100, gallons_pumped: 100, gallons_remaining: 2900 },
      { truck_sheet_id: sheet.data!.id, line_number: 2, reading_type: 'fueling', meter: 'rear', meter_start: 5000, meter_end: 5050, gallons_pumped: 50, gallons_remaining: 2850 },
    ])
    fail('readings', readings.error)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const dir = `truck_sheet/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/truck-${truck}`
    const page = `${dir}/pages/${date}_truck-${truck}_p1_e2e00001.png`
    const thumb = `${dir}/thumbs/${date}_truck-${truck}_p1_e2e00001.png`
    for (const path of [page, thumb]) {
      const up = await db.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })
      fail(`upload ${path}`, up.error)
    }
    const doc = await db.from('scanned_documents').insert({
      doc_type: 'truck_sheet', storage_path: page, thumb_path: thumb, original_filename: 'e2e.png', content_type: 'image/png',
      page_number: 1, truck_sheet_id: sheet.data!.id, fuel_truck_id: eq.data!.id, scan_date: date,
    })
    fail('scan row', doc.error)
    return { equipmentId: eq.data!.id, sheetId: sheet.data!.id }
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

  /** The equipment_reading rows of a test truck, with the truck sheet each came from (null = entered by hand). */
  async getTruckReadings(truck: string) {
    const db = createE2EDbClient()
    const { data: eq } = await db.from('equipment').select('id').eq('equipment_id', truck).maybeSingle()
    if (!eq) return []
    const { data, error } = await db
      .from('equipment_reading')
      .select('dpi_psi, nozzle_psi, truck_sheet_id, read_at')
      .eq('equipment_id', eq.id)
      .is('deleted_at', null)
    if (error) throw new Error(`getTruckReadings: ${error.message}`)
    return data ?? []
  },
}
