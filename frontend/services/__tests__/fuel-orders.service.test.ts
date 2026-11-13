import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment, makeFueler, makeUser } from '@/tests/support/factories'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { FuelOrderTransitionError } from '@/lib/fuel-orders'
import { findTransactionById } from '@/repositories/transactions.repo'
import {
  assignFuelOrder,
  cancelFuelOrder,
  createFuelOrder,
  fillFuelOrder,
  reopenFuelOrder,
  startFuelOrder,
  updateFilledOrder
} from '../fuel-orders.service'
import { assignFueler } from '../transactions.service'

const db = createTestClient()
beforeEach(async () => {
  await resetDatabase(db)
})

describe('fuel order service', () => {
  it('creates as requested by default with an FO-n ticket', async () => {
    const tx = await createFuelOrder(db, { tail_number: 'N1', fuel_type: 'jet_a' })
    expect(tx).toMatchObject({ status: 'requested', completed_at: null, tail_number: 'N1' })
    expect(tx.ticket_number).toMatch(/^FO-\d+$/)
  })

  it('creates as filled with gallons, filled time and filler, and refuses without gallons', async () => {
    const user = await makeUser(db)
    const tx = await createFuelOrder(db, { status: 'filled', gallons_delivered: 120, filled_by: user.id, source: 'phone' })
    expect(tx).toMatchObject({ status: 'filled', filled_by: user.id, source: 'phone' })
    expect(Number(tx.gallons_delivered)).toBe(120)
    expect(tx.completed_at).not.toBeNull()
    await expect(createFuelOrder(db, { status: 'filled' })).rejects.toThrow(FuelOrderTransitionError)
  })

  it('walks requested -> assigned -> fueling -> filled', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const user = await makeUser(db)
    const fueler = await makeFueler(db)
    const created = await createFuelOrder(db, { tail_number: 'N2' })

    const assigned = await assignFuelOrder(db, created.id, fueler.id)
    expect(assigned.status).toBe('assigned')
    expect(assigned.assigned_at).not.toBeNull()
    expect((await findTransactionById(db, created.id))?.fueler_assignments).toHaveLength(1)

    expect((await startFuelOrder(db, created.id)).status).toBe('fueling')

    const filled = await fillFuelOrder(db, created.id, { gallonsDelivered: 250.5, filledBy: user.id, fuelTruckId: truck.id, prist: true })
    expect(filled).toMatchObject({ status: 'filled', filled_by: user.id, fuel_truck_id: truck.id, prist: true })
    expect(Number(filled.gallons_delivered)).toBe(250.5)
    expect(filled.completed_at).not.toBeNull()
  })

  it('fills straight from requested, and refuses illegal moves without writing anything', async () => {
    const tx = await createFuelOrder(db, {})
    await expect(startFuelOrder(db, tx.id)).rejects.toThrow(FuelOrderTransitionError)
    await expect(reopenFuelOrder(db, tx.id)).rejects.toThrow(FuelOrderTransitionError)
    await expect(updateFilledOrder(db, tx.id, 10)).rejects.toThrow(FuelOrderTransitionError)
    expect((await findTransactionById(db, tx.id))?.status).toBe('requested')

    const filled = await fillFuelOrder(db, tx.id, { gallonsDelivered: 80 })
    expect(filled.status).toBe('filled')
    await expect(fillFuelOrder(db, tx.id, { gallonsDelivered: 90 })).rejects.toThrow(FuelOrderTransitionError)
    await expect(cancelFuelOrder(db, tx.id, 'no')).rejects.toThrow(FuelOrderTransitionError)
    await expect(assignFuelOrder(db, tx.id)).rejects.toThrow(FuelOrderTransitionError)
  })

  it('refuses to link a fueler when the assign itself is illegal', async () => {
    const fueler = await makeFueler(db)
    const tx = await createFuelOrder(db, {})
    await assignFuelOrder(db, tx.id)
    await expect(assignFuelOrder(db, tx.id, fueler.id)).rejects.toThrow(FuelOrderTransitionError)
    expect((await findTransactionById(db, tx.id))?.fueler_assignments).toHaveLength(0)
  })

  it('cancels with a reason and reopens to requested, clearing the reason', async () => {
    const tx = await createFuelOrder(db, {})
    await expect(cancelFuelOrder(db, tx.id, '  ')).rejects.toThrow(FuelOrderTransitionError)
    const cancelled = await cancelFuelOrder(db, tx.id, 'left without fuel')
    expect(cancelled).toMatchObject({ status: 'cancelled', cancel_reason: 'left without fuel' })

    const reopened = await reopenFuelOrder(db, tx.id)
    expect(reopened).toMatchObject({ status: 'requested', cancel_reason: null, assigned_at: null })
  })

  it('changes gallons on a filled order only through updateFilledOrder, which keeps it filled', async () => {
    const tx = await createFuelOrder(db, { status: 'filled', gallons_delivered: 100 })
    const edited = await updateFilledOrder(db, tx.id, 110.5)
    expect(edited.status).toBe('filled')
    expect(Number(edited.gallons_delivered)).toBe(110.5)
    expect(edited.completed_at).toBe(tx.completed_at)
    expect(Number((await updateFilledOrder(db, tx.id, 0)).gallons_delivered)).toBe(0)
  })

  it('assignFueler assigns a requested order, and only links a further fueler afterwards', async () => {
    const a = await makeFueler(db, { fueler_name: 'A' })
    const b = await makeFueler(db, { fueler_name: 'B' })
    const tx = await createFuelOrder(db, {})
    await assignFueler(db, tx.id, a.id)
    await assignFueler(db, tx.id, b.id)
    const found = await findTransactionById(db, tx.id)
    expect(found?.status).toBe('assigned')
    expect(found?.fueler_assignments).toHaveLength(2)
  })

  it('lets only one of two concurrent moves on the same order win', async () => {
    const tx = await createFuelOrder(db, {})
    const results = await Promise.allSettled([
      fillFuelOrder(db, tx.id, { gallonsDelivered: 100 }),
      cancelFuelOrder(db, tx.id, 'changed mind')
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    for (const f of failed) {
      expect(f.reason instanceof ConcurrencyConflictError || f.reason instanceof FuelOrderTransitionError).toBe(true)
    }
    const final = await findTransactionById(db, tx.id)
    expect(['filled', 'cancelled']).toContain(final?.status)
  })
})
