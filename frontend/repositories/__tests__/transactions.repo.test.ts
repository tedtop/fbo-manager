import { assignFuelerToTransaction } from '@/repositories/fueler-assignments.repo'
import {
  createTransaction,
  deleteTransaction,
  findAllTransactions,
  findTransactionById,
  updateTransaction
} from '@/repositories/transactions.repo'
import { createTestClient } from '@/tests/support/client'
import {
  makeEquipment,
  makeFlight,
  makeFueler
} from '@/tests/support/factories'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('transactions.repo', () => {
  it('returns null for a nonexistent transaction id', async () => {
    expect(await findTransactionById(db, 999_999)).toBeNull()
  })

  it('joins flight and fuel_truck (equipment) on findTransactionById', async () => {
    const flight = await makeFlight(db, { call_sign: 'FBO123' })
    const truck = await makeEquipment(db, {
      equipment_name: 'Truck 42',
      equipment_type: 'fuel_truck'
    })

    const tx = await createTransaction(db, {
      ticket_number: 'TICKET-1',
      flight_id: flight.id,
      fuel_truck_id: truck.id
    })

    const found = await findTransactionById(db, tx.id)
    expect(found?.flight?.call_sign).toBe('FBO123')
    expect(found?.fuel_truck?.equipment_name).toBe('Truck 42')
  })

  it('joins fueler_assignments with the nested fueler record', async () => {
    const tx = await createTransaction(db, { ticket_number: 'TICKET-2' })
    const fueler = await makeFueler(db, { fueler_name: 'Assigned Fueler' })
    await assignFuelerToTransaction(db, {
      transaction_id: tx.id,
      fueler_id: fueler.id
    })

    const found = await findTransactionById(db, tx.id)
    expect(found?.fueler_assignments).toHaveLength(1)
    expect(found?.fueler_assignments[0].fueler?.fueler_name).toBe(
      'Assigned Fueler'
    )
  })

  it('filters by progress', async () => {
    const started = await createTransaction(db, {
      ticket_number: 'A',
      progress: 'started'
    })
    await createTransaction(db, { ticket_number: 'B', progress: 'completed' })

    const results = await findAllTransactions(db, { progress: 'started' })
    expect(results.map((t) => t.id)).toEqual([started.id])
  })

  it('filters by flightId', async () => {
    const flight = await makeFlight(db)
    const linked = await createTransaction(db, {
      ticket_number: 'LINKED',
      flight_id: flight.id
    })
    await createTransaction(db, { ticket_number: 'UNLINKED' })

    const results = await findAllTransactions(db, { flightId: flight.id })
    expect(results.map((t) => t.id)).toEqual([linked.id])
  })

  it('filters by source', async () => {
    const manual = await createTransaction(db, {
      ticket_number: 'MANUAL',
      source: 'manual'
    })
    await createTransaction(db, { ticket_number: 'QT', source: 'qt' })

    const results = await findAllTransactions(db, { source: 'manual' })
    expect(results.map((t) => t.id)).toEqual([manual.id])
  })

  it('updates and deletes a transaction', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'EDIT-ME',
      progress: 'started'
    })
    const updated = await updateTransaction(db, tx.id, {
      progress: 'completed'
    })
    expect(updated.progress).toBe('completed')

    await deleteTransaction(db, tx.id)
    expect(await findTransactionById(db, tx.id)).toBeNull()
  })
})
