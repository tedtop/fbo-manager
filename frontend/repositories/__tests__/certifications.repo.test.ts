import {
  deleteCertification,
  findAllCertifications,
  upsertCertification
} from '@/repositories/certifications.repo'
import { createTestClient } from '@/tests/support/client'
import { makeFueler, makeTraining, makeUser } from '@/tests/support/factories'
import { resetDatabase } from '@/tests/support/reset'
import { beforeEach, describe, expect, it } from 'vitest'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

describe('certifications.repo', () => {
  it('joins fueler, training, and certified_by on findAllCertifications', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db, { training_name: 'Ramp Safety' })
    const certifier = await makeUser(db, { username: 'certifier' })

    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: daysFromNow(-30),
      expiry_date: daysFromNow(300),
      certified_by_id: certifier.id
    })

    const [cert] = await findAllCertifications(db)
    expect(cert.fueler?.id).toBe(fueler.id)
    expect(cert.training?.training_name).toBe('Ramp Safety')
    expect(cert.certified_by?.username).toBe('certifier')
  })

  it('upsertCertification on the same fueler+training updates instead of duplicating', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db)

    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: daysFromNow(-10),
      expiry_date: daysFromNow(100)
    })
    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: daysFromNow(-1),
      expiry_date: daysFromNow(365)
    })

    const all = await findAllCertifications(db, { fuelerId: fueler.id })
    expect(all).toHaveLength(1)
    expect(all[0].expiry_date).toBe(daysFromNow(365))
  })

  it('filters by status=expired', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db)
    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: daysFromNow(-400),
      expiry_date: daysFromNow(-30)
    })

    const results = await findAllCertifications(db, { status: 'expired' })
    expect(results).toHaveLength(1)
  })

  it('filters by status=expiring_soon within the given window', async () => {
    const fueler = await makeFueler(db)
    const trainingSoon = await makeTraining(db)
    const trainingFar = await makeTraining(db)

    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: trainingSoon.id,
      completed_date: daysFromNow(-300),
      expiry_date: daysFromNow(10)
    })
    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: trainingFar.id,
      completed_date: daysFromNow(-10),
      expiry_date: daysFromNow(300)
    })

    const results = await findAllCertifications(db, {
      status: 'expiring_soon',
      days: 30
    })
    expect(results).toHaveLength(1)
    expect(results[0].training_id).toBe(trainingSoon.id)
  })

  it('filters by status=valid (not yet expired)', async () => {
    const fueler = await makeFueler(db)
    const expiredTraining = await makeTraining(db)
    const validTraining = await makeTraining(db)

    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: expiredTraining.id,
      completed_date: daysFromNow(-400),
      expiry_date: daysFromNow(-5)
    })
    await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: validTraining.id,
      completed_date: daysFromNow(-5),
      expiry_date: daysFromNow(100)
    })

    const results = await findAllCertifications(db, { status: 'valid' })
    expect(results.map((r) => r.training_id)).toEqual([validTraining.id])
  })

  it('deletes a certification', async () => {
    const fueler = await makeFueler(db)
    const training = await makeTraining(db)
    const cert = await upsertCertification(db, {
      fueler_id: fueler.id,
      training_id: training.id,
      completed_date: daysFromNow(-1),
      expiry_date: daysFromNow(1)
    })

    await deleteCertification(db, cert.id)
    expect(await findAllCertifications(db)).toEqual([])
  })
})
