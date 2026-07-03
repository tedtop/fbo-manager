import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeFueler } from '@/tests/support/factories'
import { createTransaction } from '@/repositories/transactions.repo'
import {
  assignFuelerToTransaction,
  findAssignmentsByTransactionId,
  removeFuelerFromTransaction,
} from '@/repositories/fueler-assignments.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('fueler-assignments.repo', () => {
  it('returns an empty array when a transaction has no assignments', async () => {
    const tx = await createTransaction(db, { ticket_number: 'NO-ASSIGN' })
    expect(await findAssignmentsByTransactionId(db, tx.id)).toEqual([])
  })

  it('assigns a fueler to a transaction and finds it scoped to that transaction', async () => {
    const tx = await createTransaction(db, { ticket_number: 'ASSIGN-1' })
    const otherTx = await createTransaction(db, { ticket_number: 'ASSIGN-2' })
    const fueler = await makeFueler(db)

    await assignFuelerToTransaction(db, { transaction_id: tx.id, fueler_id: fueler.id })
    await assignFuelerToTransaction(db, { transaction_id: otherTx.id, fueler_id: fueler.id })

    const results = await findAssignmentsByTransactionId(db, tx.id)
    expect(results).toHaveLength(1)
    expect(results[0].fueler_id).toBe(fueler.id)
  })

  it('removes a specific fueler from a transaction without affecting others', async () => {
    const tx = await createTransaction(db, { ticket_number: 'REMOVE-TEST' })
    const fuelerA = await makeFueler(db)
    const fuelerB = await makeFueler(db)
    await assignFuelerToTransaction(db, { transaction_id: tx.id, fueler_id: fuelerA.id })
    await assignFuelerToTransaction(db, { transaction_id: tx.id, fueler_id: fuelerB.id })

    await removeFuelerFromTransaction(db, tx.id, fuelerA.id)

    const results = await findAssignmentsByTransactionId(db, tx.id)
    expect(results.map((r) => r.fueler_id)).toEqual([fuelerB.id])
  })

  it('fails to assign a fueler to a nonexistent transaction (FK guard)', async () => {
    const fueler = await makeFueler(db)
    await expect(
      assignFuelerToTransaction(db, { transaction_id: 999_999, fueler_id: fueler.id })
    ).rejects.toThrow()
  })
})
