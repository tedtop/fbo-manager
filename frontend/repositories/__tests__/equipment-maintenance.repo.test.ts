import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import {
  countOpenMaintenanceItems,
  createMaintenanceItem,
  deleteMaintenanceItem,
  findMaintenanceItems,
  reopenMaintenanceItem,
  resolveMaintenanceItem,
  updateMaintenanceItem,
} from '@/repositories/equipment-maintenance.repo'
import { createTruckSheet, findTruckSheetsForEquipment } from '@/repositories/truck-sheets.repo'

const db = createTestClient()

beforeEach(() => resetDatabase(db))

describe('equipment maintenance items', () => {
  it('creates an open item with the given noted_at and DB-owned timestamps, lists newest noted first', async () => {
    const eq = await makeEquipment(db)
    const a = await createMaintenanceItem(db, { equipment_id: eq.id, title: 'Dead battery', noted_at: '2026-11-05T09:00:00Z' })
    const b = await createMaintenanceItem(db, { equipment_id: eq.id, title: 'Flat tire', description: 'rear left', noted_at: '2026-11-05T12:00:00Z' })
    expect(a.status).toBe('open')
    expect(Date.parse(a.noted_at)).toBe(Date.parse('2026-11-05T09:00:00Z'))
    expect(a.resolved_at).toBeNull()
    expect((await findMaintenanceItems(db, eq.id)).map((i) => i.id)).toEqual([b.id, a.id])
  })

  it('resolves with notes and a timestamp, reopens, and bumps updated_at on every change', async () => {
    const eq = await makeEquipment(db)
    const item = await createMaintenanceItem(db, { equipment_id: eq.id, title: 'Dead battery' })
    await new Promise((r) => setTimeout(r, 20))
    const resolved = await resolveMaintenanceItem(db, item.id, { resolutionNotes: 'Replaced', resolvedAt: '2026-11-05T15:00:00Z' })
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolution_notes).toBe('Replaced')
    expect(Date.parse(resolved.resolved_at as string)).toBe(Date.parse('2026-11-05T15:00:00Z'))
    expect(Date.parse(resolved.updated_at)).toBeGreaterThan(Date.parse(item.updated_at))

    const reopened = await reopenMaintenanceItem(db, item.id)
    expect(reopened).toMatchObject({ status: 'open', resolved_at: null, resolution_notes: '' })
  })

  it('refuses a resolved item without resolved_at (DB check)', async () => {
    const eq = await makeEquipment(db)
    const item = await createMaintenanceItem(db, { equipment_id: eq.id, title: 'x' })
    await expect(updateMaintenanceItem(db, item.id, { status: 'resolved' })).rejects.toMatchObject({ code: '23514' })
  })

  it('soft deletes: the row stays but drops out of the list and the open count', async () => {
    const eq = await makeEquipment(db)
    const other = await makeEquipment(db)
    const gone = await createMaintenanceItem(db, { equipment_id: eq.id, title: 'gone' })
    await createMaintenanceItem(db, { equipment_id: eq.id, title: 'kept' })
    await createMaintenanceItem(db, { equipment_id: other.id, title: 'other' })
    const done = await createMaintenanceItem(db, { equipment_id: other.id, title: 'done' })
    await resolveMaintenanceItem(db, done.id)
    await deleteMaintenanceItem(db, gone.id)

    expect((await findMaintenanceItems(db, eq.id)).map((i) => i.title)).toEqual(['kept'])
    const counts = await countOpenMaintenanceItems(db)
    expect(counts.get(eq.id)).toBe(1)
    expect(counts.get(other.id)).toBe(1)
    const { data } = await db.from('equipment_maintenance_item').select('deleted_at').eq('id', gone.id).single()
    expect(data?.deleted_at).not.toBeNull()
  })
})

describe('findTruckSheetsForEquipment', () => {
  it('returns only the sheets of that truck, newest date first, honouring the limit', async () => {
    const truck = await makeEquipment(db, { equipment_id: '8338' })
    const other = await makeEquipment(db, { equipment_id: '8339' })
    for (const date of ['2026-07-01', '2026-07-03', '2026-07-02']) {
      await createTruckSheet(db, { sheet_date: date, fuel_truck_id: truck.id, truck_number: '8338', fuel_type: 'jet_a' })
    }
    await createTruckSheet(db, { sheet_date: '2026-07-04', fuel_truck_id: other.id, truck_number: '8339', fuel_type: 'jet_a' })

    expect((await findTruckSheetsForEquipment(db, truck.id, 30)).map((s) => s.sheet_date)).toEqual(['2026-07-03', '2026-07-02', '2026-07-01'])
    expect(await findTruckSheetsForEquipment(db, truck.id, 2)).toHaveLength(2)
    expect(await findTruckSheetsForEquipment(db, 999999, 30)).toEqual([])
  })
})
