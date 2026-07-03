import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeFueler, makeTraining } from '@/tests/support/factories'
import {
  createAssignedTraining,
  findAssignedTrainingByFuelerId,
  updateAssignedTraining,
} from '@/repositories/assigned-training.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

describe('assigned-training.repo', () => {
  it('returns only status=assigned entries, joined with the training record', async () => {
    const fueler = await makeFueler(db)
    const trainingA = await makeTraining(db, { training_name: 'Deicing 101' })
    const trainingB = await makeTraining(db)

    const assigned = await createAssignedTraining(db, {
      fueler_id: fueler.id,
      training_id: trainingA.id,
    })
    const completedEntry = await createAssignedTraining(db, {
      fueler_id: fueler.id,
      training_id: trainingB.id,
    })
    await updateAssignedTraining(db, completedEntry.id, { status: 'completed' })

    const results = await findAssignedTrainingByFuelerId(db, fueler.id)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(assigned.id)
    expect((results[0] as unknown as { training: { training_name: string } }).training.training_name).toBe(
      'Deicing 101'
    )
  })

  it('does not return a different fueler\'s assigned trainings', async () => {
    const fueler = await makeFueler(db)
    const otherFueler = await makeFueler(db)
    const training = await makeTraining(db)

    await createAssignedTraining(db, { fueler_id: otherFueler.id, training_id: training.id })

    expect(await findAssignedTrainingByFuelerId(db, fueler.id)).toEqual([])
  })

  it('orders results by assigned_at descending', async () => {
    const fueler = await makeFueler(db)
    const trainingA = await makeTraining(db)
    const trainingB = await makeTraining(db)

    const first = await createAssignedTraining(db, { fueler_id: fueler.id, training_id: trainingA.id })
    const second = await createAssignedTraining(db, { fueler_id: fueler.id, training_id: trainingB.id })

    const results = await findAssignedTrainingByFuelerId(db, fueler.id)
    expect(results.map((r) => r.id)).toEqual([second.id, first.id])
  })

  it('updates status and completed_at', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db)
    const entry = await createAssignedTraining(db, { fueler_id: fueler.id, training_id: training.id })

    const updated = await updateAssignedTraining(db, entry.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    expect(updated.status).toBe('completed')
    expect(updated.completed_at).not.toBeNull()
  })
})
