import { describe, expect, it } from 'vitest'
import type { StaffMember } from '@/repositories/staff.repo'
import type { TrainingCompletionWithRecorder } from '@/repositories/training-completions.repo'
import type { TrainingCourseRow } from '@/repositories/training-courses.repo'
import {
  buildComplianceMatrix,
  cellKey,
  computeExpiresOn,
  EXPIRING_SOON_DAYS,
  formatValidity,
  statusForExpiry,
  validateCertificateFile,
} from '@/services/training.service'

const TODAY = new Date(2026, 10, 13) // 2026-11-13, local

const staff = (userId: number): StaffMember => ({
  userId, firstName: 'S', lastName: String(userId), username: `s${userId}`, title: '', displayOrder: userId,
})
const course = (id: number): TrainingCourseRow =>
  ({ id, name: `Course ${id}`, url: '', instructions: '', validity_amount: 1, validity_unit: 'years', display_order: id, is_active: true, created_at: '', updated_at: '' }) as TrainingCourseRow
const completion = (over: Partial<TrainingCompletionWithRecorder>): TrainingCompletionWithRecorder =>
  ({ id: 1, course_id: 1, user_id: 1, completed_on: '2026-01-01', expires_on: '2027-01-01', certificate_path: null, certificate_name: null, notes: '', recorded_by_id: null, created_at: '', updated_at: '', recorded_by: null, ...over }) as TrainingCompletionWithRecorder

describe('computeExpiresOn', () => {
  it('adds the validity period to the completion date', () => {
    expect(computeExpiresOn('2026-11-13', 1, 'years')).toBe('2027-11-13')
    expect(computeExpiresOn('2026-11-13', 6, 'months')).toBe('2027-05-13')
    expect(computeExpiresOn('2026-11-13', 2, 'weeks')).toBe('2026-11-27')
    expect(computeExpiresOn('2026-11-13', 90, 'days')).toBe('2027-02-11')
  })

  it('clamps month ends instead of rolling over', () => {
    expect(computeExpiresOn('2026-08-31', 6, 'months')).toBe('2027-02-28')
  })

  it('never expires without a validity period', () => {
    expect(computeExpiresOn('2026-11-13', null, null)).toBeNull()
    expect(computeExpiresOn('2026-11-13', 1, null)).toBeNull()
  })
})

describe('statusForExpiry', () => {
  it('is current without an expiry date', () => {
    expect(statusForExpiry(null, TODAY)).toEqual({ status: 'current', daysUntilExpiry: null })
  })

  it('is expired once the date has passed, current on the day itself', () => {
    expect(statusForExpiry('2026-11-12', TODAY)).toEqual({ status: 'expired', daysUntilExpiry: -1 })
    expect(statusForExpiry('2026-11-13', TODAY).status).toBe('expiring')
  })

  it(`is expiring within ${EXPIRING_SOON_DAYS} days and current beyond`, () => {
    expect(statusForExpiry('2026-12-13', TODAY)).toEqual({ status: 'expiring', daysUntilExpiry: 30 })
    expect(statusForExpiry('2026-12-14', TODAY)).toEqual({ status: 'current', daysUntilExpiry: 31 })
  })
})

describe('formatValidity', () => {
  it('reads naturally, singular for one', () => {
    expect(formatValidity({ validity_amount: 1, validity_unit: 'years' })).toBe('1 year')
    expect(formatValidity({ validity_amount: 6, validity_unit: 'months' })).toBe('6 months')
    expect(formatValidity({ validity_amount: null, validity_unit: null })).toBe('No expiration')
  })
})

describe('buildComplianceMatrix', () => {
  it('has one cell per staff x course pair, missing until something is recorded', () => {
    const m = buildComplianceMatrix([staff(1), staff(2)], [course(1), course(2)], [], TODAY)
    expect(m.cells.size).toBe(4)
    expect(m.totals).toEqual({ current: 0, expiring: 0, expired: 0, missing: 4 })
    expect(m.cells.get(cellKey(1, 1))?.status).toBe('missing')
  })

  it('takes the newest completion as governing and keeps the rest as history', () => {
    const newest = completion({ id: 2, completed_on: '2026-10-01', expires_on: '2027-10-01' })
    const older = completion({ id: 1, completed_on: '2025-01-01', expires_on: '2026-01-01' })
    const m = buildComplianceMatrix([staff(1)], [course(1)], [newest, older], TODAY)
    const cell = m.cells.get(cellKey(1, 1))!
    expect(cell.status).toBe('current')
    expect(cell.latest?.id).toBe(2)
    expect(cell.history.map((h) => h.id)).toEqual([2, 1])
  })

  it('counts each status and ignores completions for staff or courses not in the matrix', () => {
    const m = buildComplianceMatrix(
      [staff(1), staff(2), staff(3)],
      [course(1)],
      [
        completion({ id: 1, user_id: 1, expires_on: '2027-06-01' }), // current
        completion({ id: 2, user_id: 2, expires_on: '2026-11-20' }), // expiring
        completion({ id: 3, user_id: 99, expires_on: '2027-06-01' }), // not on the roster
        completion({ id: 4, user_id: 1, course_id: 9 }), // retired course
      ],
      TODAY
    )
    expect(m.totals).toEqual({ current: 1, expiring: 1, expired: 0, missing: 1 })
    expect(m.cells.has(cellKey(99, 1))).toBe(false)
  })

  it('marks a lapsed certificate expired', () => {
    const m = buildComplianceMatrix([staff(1)], [course(1)], [completion({ expires_on: '2026-01-01' })], TODAY)
    expect(m.cells.get(cellKey(1, 1))).toMatchObject({ status: 'expired' })
    expect(m.cells.get(cellKey(1, 1))!.daysUntilExpiry).toBeLessThan(0)
  })
})

describe('validateCertificateFile', () => {
  const file = (type: string, size: number) => ({ type, size }) as File

  it('accepts a PDF or image under 10 MB', () => {
    expect(validateCertificateFile(file('application/pdf', 1000))).toBeNull()
    expect(validateCertificateFile(file('image/heic', 1000))).toBeNull()
  })

  it('refuses other types and oversize files', () => {
    expect(validateCertificateFile(file('text/plain', 10))).toMatch(/PDF or image/)
    expect(validateCertificateFile(file('application/pdf', 10 * 1024 * 1024 + 1))).toMatch(/10 MB/)
  })
})
