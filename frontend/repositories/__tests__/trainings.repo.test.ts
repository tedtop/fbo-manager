import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import {
  createTraining,
  deleteTraining,
  findAllTrainings,
  findTrainingById,
  updateTraining,
} from '@/repositories/trainings.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('trainings.repo', () => {
  it('returns null for a nonexistent training id', async () => {
    expect(await findTrainingById(db, 999_999)).toBeNull()
  })

  it('creates, finds, updates, and deletes a training', async () => {
    const created = await createTraining(db, {
      training_name: 'Fuel Safety',
      validity_period_days: 180,
    })
    expect(await findTrainingById(db, created.id)).toMatchObject({ training_name: 'Fuel Safety' })

    const updated = await updateTraining(db, created.id, { validity_period_days: 365 })
    expect(updated.validity_period_days).toBe(365)

    await deleteTraining(db, created.id)
    expect(await findTrainingById(db, created.id)).toBeNull()
  })

  it('lists trainings ordered by training_name', async () => {
    await createTraining(db, { training_name: 'Zulu Training', validity_period_days: 1 })
    await createTraining(db, { training_name: 'Alpha Training', validity_period_days: 1 })
    const all = await findAllTrainings(db)
    expect(all.map((t) => t.training_name)).toEqual(['Alpha Training', 'Zulu Training'])
  })
})
