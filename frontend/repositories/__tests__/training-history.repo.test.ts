import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeFueler, makeTraining } from '@/tests/support/factories'
import { createTrainingHistory, findHistoryByFuelerId } from '@/repositories/training-history.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('training-history.repo', () => {
  it('returns an empty array for a fueler with no history', async () => {
    const fueler = await makeFueler(db)
    expect(await findHistoryByFuelerId(db, fueler.id)).toEqual([])
  })

  it('creates a history entry and finds it scoped to its fueler', async () => {
    const fueler = await makeFueler(db)
    const otherFueler = await makeFueler(db)
    const training = await makeTraining(db)

    await createTrainingHistory(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: '2026-01-01',
      expiry_date: '2027-01-01',
    })
    await createTrainingHistory(db, {
      fueler_id: otherFueler.id,
      training_id: training.id,
      completed_date: '2026-01-01',
      expiry_date: '2027-01-01',
    })

    const history = await findHistoryByFuelerId(db, fueler.id)
    expect(history).toHaveLength(1)
    expect(history[0].fueler_id).toBe(fueler.id)
  })

  it('orders history by completed_date descending', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db)
    await createTrainingHistory(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: '2024-01-01',
      expiry_date: '2025-01-01',
    })
    await createTrainingHistory(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: '2026-01-01',
      expiry_date: '2027-01-01',
    })

    const history = await findHistoryByFuelerId(db, fueler.id)
    expect(history.map((h) => h.completed_date)).toEqual(['2026-01-01', '2024-01-01'])
  })
})
