import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import { createTruckSheet } from '@/repositories/truck-sheets.repo'
import {
  findExistingSheetInfo,
  findScansForTruckSheet,
  findStoredHashes,
  getScanSignedUrls,
  insertTruckSheetScanRows,
  removeScanObjects,
  uploadTruckSheetPages,
  type PreparedPage,
} from '@/repositories/scanned-documents.repo'

const db = createTestClient()

// Storage objects are not part of resetDatabase: remove what these tests put under the test trucks' folders.
async function wipeFolder(dir: string) {
  const { data } = await db.storage.from('scans').list(dir, { limit: 100 })
  const files: string[] = []
  for (const o of data ?? []) {
    if (o.id === null) await wipeFolder(`${dir}/${o.name}`)
    else files.push(`${dir}/${o.name}`)
  }
  if (files.length > 0) await db.storage.from('scans').remove(files)
}
const wipeAll = async () => {
  for (const t of ['5282', '5299']) await wipeFolder(`truck_sheet/2026/07/2026-07-14/truck-${t}`)
}

beforeEach(async () => {
  await resetDatabase(db)
  await wipeAll()
})
afterEach(wipeAll)

const DATE = '2026-07-14'
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9])], { type: 'image/jpeg' })
const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'Truck Sheets.pdf', { type: 'application/pdf' })

function page(n: number, over: Partial<PreparedPage> = {}): PreparedPage {
  return { blob: jpeg(n), rotation: 0, hash: `hash-${n}`.padEnd(64, '0'), pageNumber: n, originalIndex: 0, originalPage: n, ...over }
}

async function makeSheet(truckNumber = '5282') {
  const truck = await makeEquipment(db, { equipment_type: 'fuel_truck', equipment_id: truckNumber })
  const sheet = await createTruckSheet(db, { sheet_date: DATE, fuel_truck_id: truck.id, truck_number: truckNumber, fuel_type: 'jet_a' })
  return { truck, sheet }
}

describe('truck sheet page scans', () => {
  it('stores 2 upright pages and one original, links them in page order, and finds the sheet again', async () => {
    const { truck, sheet } = await makeSheet()
    const up = await uploadTruckSheetPages(db, {
      sheetDate: DATE,
      truckNumber: '5282',
      originals: [pdf],
      pages: [page(1, { rotation: 90 }), page(2)],
    })
    const rows = await insertTruckSheetScanRows(db, { truckSheetId: sheet.id, fuelTruckId: truck.id, drafts: up.drafts })
    expect(rows).toHaveLength(2)

    const scans = await findScansForTruckSheet(db, sheet.id)
    expect(scans.map((s) => s.page_number)).toEqual([1, 2])
    expect(scans.map((s) => s.rotation_degrees)).toEqual([90, 0])
    expect(scans[0].storage_path).toBe(`truck_sheet/2026/07/${DATE}/truck-5282/${DATE}_truck-5282_p1.jpg`)
    expect(scans[0].original_path).toMatch(/\/original\/2026-07-14_truck-5282_[0-9a-f]{8}\.pdf$/)
    expect(scans[1].original_path).toBe(scans[0].original_path)
    expect(scans[0].fuel_truck_id).toBe(truck.id)
    expect(scans[0].scan_date).toBe(DATE)

    const urls = await getScanSignedUrls(db, [scans[0].storage_path, scans[0].original_path as string])
    expect(urls.size).toBe(2)

    expect(await findExistingSheetInfo(db, '5282', DATE)).toMatchObject({ id: sheet.id, pageCount: 2, maxPageNumber: 2, fuelTruckId: truck.id })
    expect(await findExistingSheetInfo(db, '5282', '2026-07-15')).toBeNull()
    expect([...(await findStoredHashes(db, [scans[0].content_sha256 as string, 'nope']))]).toEqual([scans[0].content_sha256])
  })

  it('never overwrites: a taken page path gets a suffix instead', async () => {
    await makeSheet()
    const first = await uploadTruckSheetPages(db, { sheetDate: DATE, truckNumber: '5282', originals: [pdf], pages: [page(1)] })
    const second = await uploadTruckSheetPages(db, { sheetDate: DATE, truckNumber: '5282', originals: [pdf], pages: [page(1)] })
    expect(second.drafts[0].storage_path).not.toBe(first.drafts[0].storage_path)
    expect(second.drafts[0].storage_path).toMatch(/_p1-[0-9a-f]{8}\.jpg$/)
    await removeScanObjects(db, [...first.paths, ...second.paths])
  })

  it('rejects a second page 2 or the same page twice on one sheet (unique indexes)', async () => {
    const { truck, sheet } = await makeSheet()
    const up = await uploadTruckSheetPages(db, { sheetDate: DATE, truckNumber: '5282', originals: [pdf], pages: [page(1), page(2)] })
    await insertTruckSheetScanRows(db, { truckSheetId: sheet.id, fuelTruckId: truck.id, drafts: up.drafts })
    const again = await uploadTruckSheetPages(db, { sheetDate: DATE, truckNumber: '5282', originals: [pdf], pages: [page(2, { hash: 'z'.padEnd(64, 'z') })] })
    await expect(insertTruckSheetScanRows(db, { truckSheetId: sheet.id, fuelTruckId: truck.id, drafts: again.drafts })).rejects.toThrow()
    await removeScanObjects(db, again.paths)
  })

  it('removes what it uploaded when a later upload fails', async () => {
    // a page without a blob makes the second upload fail after the original and page 1 went up
    const bad = { ...page(2), blob: undefined as unknown as Blob }
    await expect(
      uploadTruckSheetPages(db, { sheetDate: DATE, truckNumber: '5299', originals: [pdf], pages: [page(1), bad] })
    ).rejects.toBeTruthy()
    const { data } = await db.storage.from('scans').list(`truck_sheet/2026/07/${DATE}/truck-5299`)
    expect((data ?? []).filter((o) => o.id !== null)).toHaveLength(0)
    const { data: orig } = await db.storage.from('scans').list(`truck_sheet/2026/07/${DATE}/truck-5299/original`)
    expect(orig ?? []).toHaveLength(0)
  })
})
