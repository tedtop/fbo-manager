import {
  createEquipment,
  deleteEquipment,
  findAllEquipment,
  findEquipmentById,
  updateEquipment
} from '@/repositories/equipment.repo'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('equipment.repo', () => {
  it('returns an empty array when no equipment exists', async () => {
    const result = await findAllEquipment(db)
    expect(result).toEqual([])
  })

  it('creates equipment and persists it for later reads', async () => {
    const created = await createEquipment(db, {
      equipment_id: 'EQ-100',
      equipment_name: 'Truck 1',
      equipment_type: 'fuel_truck'
    })
    expect(created.id).toBeTypeOf('number')
    expect(created.status).toBe('available')

    const all = await findAllEquipment(db)
    expect(all).toHaveLength(1)
    expect(all[0].equipment_name).toBe('Truck 1')
  })

  it('orders results by equipment_name', async () => {
    await createEquipment(db, {
      equipment_id: 'EQ-2',
      equipment_name: 'Zebra Truck',
      equipment_type: 'fuel_truck'
    })
    await createEquipment(db, {
      equipment_id: 'EQ-1',
      equipment_name: 'Alpha Truck',
      equipment_type: 'fuel_truck'
    })

    const all = await findAllEquipment(db)
    expect(all.map((e) => e.equipment_name)).toEqual([
      'Alpha Truck',
      'Zebra Truck'
    ])
  })

  it('returns null (not an error) when finding a nonexistent id', async () => {
    const result = await findEquipmentById(db, 999_999)
    expect(result).toBeNull()
  })

  it('finds equipment by id after creation', async () => {
    const created = await createEquipment(db, {
      equipment_id: 'EQ-3',
      equipment_name: 'GPU 1',
      equipment_type: 'gpu'
    })
    const found = await findEquipmentById(db, created.id)
    expect(found?.equipment_id).toBe('EQ-3')
  })

  it('updates equipment fields', async () => {
    const created = await createEquipment(db, {
      equipment_id: 'EQ-4',
      equipment_name: 'Tug 1',
      equipment_type: 'tug'
    })
    const updated = await updateEquipment(db, created.id, {
      status: 'maintenance'
    })
    expect(updated.status).toBe('maintenance')
  })

  it('deletes equipment', async () => {
    const created = await createEquipment(db, {
      equipment_id: 'EQ-5',
      equipment_name: 'Stairs 1',
      equipment_type: 'stairs'
    })
    await deleteEquipment(db, created.id)
    const found = await findEquipmentById(db, created.id)
    expect(found).toBeNull()
  })

  it('rejects an unknown equipment_type (schema/type drift guard)', async () => {
    await expect(
      createEquipment(db, {
        equipment_id: 'EQ-6',
        equipment_name: 'Mystery',
        // @ts-expect-error intentionally invalid to prove the DB constraint is live
        equipment_type: 'not_a_real_type'
      })
    ).rejects.toThrow()
  })
})
