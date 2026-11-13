import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment, makeFlight, makeFueler } from '@/tests/support/factories'
import { assignFuelerToTransaction } from '@/repositories/fueler-assignments.repo'
import {
  createTransaction,
  deleteTransaction,
  findAllTransactions,
  findTransactionById,
  updateTransaction,
} from '@/repositories/transactions.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('transactions.repo', () => {
  it('gives two concurrent creates distinct FO-n ticket numbers from the database sequence', async () => {
    const [a, b] = await Promise.all([createTransaction(db, {}), createTransaction(db, {})])
    expect(a.ticket_number).toMatch(/^FO-\d+$/)
    expect(b.ticket_number).toMatch(/^FO-\d+$/)
    expect(a.ticket_number).not.toBe(b.ticket_number)

    const many = await Promise.all(Array.from({ length: 10 }, () => createTransaction(db, {})))
    expect(new Set(many.map((t) => t.ticket_number)).size).toBe(10)
  })

  it('defaults a new order to requested with prist off, and keeps an explicit ticket number', async () => {
    const tx = await createTransaction(db, { ticket_number: 'QT-1' })
    expect(tx).toMatchObject({ status: 'requested', prist: false, cancel_reason: null, filled_by: null, requested_for: null })
    expect(tx.ticket_number).toBe('QT-1')
  })

  it('accepts the phone and scan sources and rejects an unknown status', async () => {
    expect((await createTransaction(db, { source: 'phone' })).source).toBe('phone')
    expect((await createTransaction(db, { source: 'scan' })).source).toBe('scan')
    await expect(createTransaction(db, { status: 'started' as never })).rejects.toThrow()
  })

  it('returns null for a nonexistent transaction id', async () => {
    expect(await findTransactionById(db, 999_999)).toBeNull()
  })

  it('joins flight and fuel_truck (equipment) on findTransactionById', async () => {
    const flight = await makeFlight(db, { call_sign: 'FBO123' })
    const truck = await makeEquipment(db, { equipment_name: 'Truck 42', equipment_type: 'fuel_truck' })

    const tx = await createTransaction(db, {
      ticket_number: 'TICKET-1',
      flight_id: flight.id,
      fuel_truck_id: truck.id,
    })

    const found = await findTransactionById(db, tx.id)
    expect(found?.flight?.call_sign).toBe('FBO123')
    expect(found?.fuel_truck?.equipment_name).toBe('Truck 42')
  })

  it('joins fueler_assignments with the nested fueler record', async () => {
    const tx = await createTransaction(db, { ticket_number: 'TICKET-2' })
    const fueler = await makeFueler(db, { fueler_name: 'Assigned Fueler' })
    await assignFuelerToTransaction(db, { transaction_id: tx.id, fueler_id: fueler.id })

    const found = await findTransactionById(db, tx.id)
    expect(found?.fueler_assignments).toHaveLength(1)
    expect(found?.fueler_assignments[0].fueler?.fueler_name).toBe('Assigned Fueler')
  })

  it('filters by status', async () => {
    const started = await createTransaction(db, { ticket_number: 'A', status: 'requested' })
    await createTransaction(db, { ticket_number: 'B', status: 'filled' })

    const results = await findAllTransactions(db, { status: 'requested' })
    expect(results.map((t) => t.id)).toEqual([started.id])
  })

  it('filters by flightId', async () => {
    const flight = await makeFlight(db)
    const linked = await createTransaction(db, { ticket_number: 'LINKED', flight_id: flight.id })
    await createTransaction(db, { ticket_number: 'UNLINKED' })

    const results = await findAllTransactions(db, { flightId: flight.id })
    expect(results.map((t) => t.id)).toEqual([linked.id])
  })

  it('filters by source', async () => {
    const manual = await createTransaction(db, { ticket_number: 'MANUAL', source: 'manual' })
    await createTransaction(db, { ticket_number: 'QT', source: 'qt' })

    const results = await findAllTransactions(db, { source: 'manual' })
    expect(results.map((t) => t.id)).toEqual([manual.id])
  })

  it('updates and deletes a transaction', async () => {
    const tx = await createTransaction(db, { ticket_number: 'EDIT-ME', status: 'requested' })
    const updated = await updateTransaction(db, tx.id, { status: 'filled' })
    expect(updated.status).toBe('filled')

    await deleteTransaction(db, tx.id)
    expect(await findTransactionById(db, tx.id)).toBeNull()
  })
})
