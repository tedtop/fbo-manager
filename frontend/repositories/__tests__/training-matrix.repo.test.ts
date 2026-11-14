import { beforeEach, describe, expect, it } from 'vitest'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeUser } from '@/tests/support/factories'
import { findActiveStaff, staffDisplayName } from '@/repositories/staff.repo'
import {
  createCourse, deleteCourse, findAllCourses, updateCourse,
} from '@/repositories/training-courses.repo'
import { createCompletion, deleteCompletion, findAllCompletions } from '@/repositories/training-completions.repo'
import { recordCompletion } from '@/services/training.service'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

async function roster(...userIds: number[]) {
  const { data: dept, error } = await db.from('department').insert({ name: 'Line', slug: `line-${Date.now()}` }).select().single()
  if (error) throw error
  for (const [i, userId] of userIds.entries()) {
    const { error: e } = await db.from('department_member').insert({ department_id: dept.id, user_id: userId, display_order: i })
    if (e) throw e
  }
  return dept
}

describe('training-courses.repo', () => {
  it('creates a course with defaults and lists active ones in display order', async () => {
    await createCourse(db, { name: 'Zeta', display_order: 2 })
    await createCourse(db, { name: 'Alpha', display_order: 1, validity_amount: 1, validity_unit: 'years' })
    await createCourse(db, { name: 'Retired', display_order: 0, is_active: false })

    const active = await findAllCourses(db)
    expect(active.map((c) => c.name)).toEqual(['Alpha', 'Zeta'])
    expect(active[0]).toMatchObject({ validity_amount: 1, validity_unit: 'years', url: '', instructions: '', is_active: true })
    expect((await findAllCourses(db, { includeInactive: true })).map((c) => c.name)).toEqual(['Retired', 'Alpha', 'Zeta'])
  })

  it('updates a course and retires it without deleting', async () => {
    const c = await createCourse(db, { name: 'Hazmat' })
    const updated = await updateCourse(db, c.id, { name: 'Hazmat 2', url: 'https://example.test/hazmat', is_active: false })
    expect(updated).toMatchObject({ name: 'Hazmat 2', url: 'https://example.test/hazmat', is_active: false })
  })

  it('guards the update with expectedUpdatedAt: matches once, then a stale value throws ConcurrencyConflictError and writes nothing', async () => {
    const c = await createCourse(db, { name: 'Guarded' })
    const loaded = c.updated_at

    const first = await updateCourse(db, c.id, { instructions: 'first' }, loaded)
    expect(first.instructions).toBe('first')
    expect(new Date(first.updated_at).getTime()).toBeGreaterThan(new Date(loaded).getTime())

    await expect(updateCourse(db, c.id, { instructions: 'stale' }, loaded)).rejects.toBeInstanceOf(
      ConcurrencyConflictError
    )
    const { data } = await db.from('training_course').select('instructions').eq('id', c.id).single()
    expect(data?.instructions).toBe('first')
  })

  it('without expectedUpdatedAt the update is unconditional (the Overwrite anyway path)', async () => {
    const c = await createCourse(db, { name: 'Unguarded' })
    await updateCourse(db, c.id, { instructions: 'theirs' })
    await expect(updateCourse(db, c.id, { instructions: 'ours' })).resolves.toMatchObject({ instructions: 'ours' })
  })

  it('refuses a validity unit outside days/weeks/months/years', async () => {
    await expect(createCourse(db, { name: 'Bad', validity_amount: 1, validity_unit: 'decades' as never })).rejects.toBeTruthy()
  })

  it('deletes a course, and its completions go with it', async () => {
    const u = await makeUser(db)
    const c = await createCourse(db, { name: 'Gone' })
    await createCompletion(db, { course_id: c.id, user_id: u.id, completed_on: '2026-11-01' })
    await deleteCourse(db, c.id)
    expect(await findAllCompletions(db)).toEqual([])
  })
})

describe('training-completions.repo', () => {
  it('lists completions newest first with the recorder joined', async () => {
    const worker = await makeUser(db, { first_name: 'Wes', last_name: 'Worker' })
    const boss = await makeUser(db, { first_name: 'Bea', last_name: 'Boss' })
    const c = await createCourse(db, { name: 'Ramp safety' })
    await createCompletion(db, { course_id: c.id, user_id: worker.id, completed_on: '2025-03-01' })
    await createCompletion(db, { course_id: c.id, user_id: worker.id, completed_on: '2026-03-01', recorded_by_id: boss.id, notes: 'renewal' })

    const rows = await findAllCompletions(db)
    expect(rows.map((r) => r.completed_on)).toEqual(['2026-03-01', '2025-03-01'])
    expect(rows[0].recorded_by?.first_name).toBe('Bea')
    expect(rows[0].notes).toBe('renewal')
    expect(rows[1].recorded_by).toBeNull()
  })

  it('deletes one completion and leaves the others', async () => {
    const u = await makeUser(db)
    const c = await createCourse(db, { name: 'CPR' })
    const a = await createCompletion(db, { course_id: c.id, user_id: u.id, completed_on: '2026-01-01' })
    await createCompletion(db, { course_id: c.id, user_id: u.id, completed_on: '2026-02-01' })
    await deleteCompletion(db, a.id)
    expect((await findAllCompletions(db)).map((r) => r.completed_on)).toEqual(['2026-02-01'])
  })

  it('recordCompletion stamps the expiry from the course validity (and none when it never expires)', async () => {
    const u = await makeUser(db)
    const year = await createCourse(db, { name: 'Annual', validity_amount: 1, validity_unit: 'years' })
    const forever = await createCourse(db, { name: 'Orientation' })
    await recordCompletion(db, { userId: u.id, course: year, completedOn: '2026-11-13', notes: '', certificateFile: null, recordedById: null })
    await recordCompletion(db, { userId: u.id, course: forever, completedOn: '2026-11-13', notes: '', certificateFile: null, recordedById: null })

    const byCourse = new Map((await findAllCompletions(db)).map((r) => [r.course_id, r]))
    expect(byCourse.get(year.id)?.expires_on).toBe('2027-11-13')
    expect(byCourse.get(forever.id)?.expires_on).toBeNull()
  })

  it('recordCompletion attributes the completion to the signed-in profile with no legacy users row (B141)', async () => {
    const u = await makeUser(db)
    const c = await createCourse(db, { name: 'Annual' })
    const email = `b141-${Date.now()}@example.test`
    const { data: created, error } = await db.auth.admin.createUser({ email, password: 'Test-pass-123!', email_confirm: true })
    if (error) throw error
    const profileId = created.user.id
    try {
      await db.from('profiles').upsert({ id: profileId, email, first_name: 'Pat', last_name: 'Profile' })
      await recordCompletion(db, { userId: u.id, course: c, completedOn: '2026-11-13', notes: '', certificateFile: null, recordedById: null, recordedByProfileId: profileId })
      const [row] = await findAllCompletions(db)
      expect(row.recorded_by_id).toBeNull()
      expect(row.recorded_by_profile_id).toBe(profileId)
      expect(row.recorded_by_profile).toMatchObject({ id: profileId, first_name: 'Pat', last_name: 'Profile' })
      expect(row.recorded_by).toBeNull()
    } finally {
      await db.from('training_completion').delete().eq('recorded_by_profile_id', profileId)
      await db.auth.admin.deleteUser(profileId)
    }
  })

  it('recordCompletion refuses a certificate that is neither PDF nor image, before writing anything', async () => {
    const u = await makeUser(db)
    const c = await createCourse(db, { name: 'Annual' })
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    await expect(
      recordCompletion(db, { userId: u.id, course: c, completedOn: '2026-11-13', notes: '', certificateFile: file, recordedById: null })
    ).rejects.toThrow(/PDF or image/)
    expect(await findAllCompletions(db)).toEqual([])
  })
})

describe('staff.repo', () => {
  it('lists each active roster user once, in roster order, skipping inactive users and members', async () => {
    const a = await makeUser(db, { first_name: 'Ann', last_name: 'A' })
    const b = await makeUser(db, { first_name: 'Bob', last_name: 'B' })
    const off = await makeUser(db, { first_name: 'Off', last_name: 'Duty', is_active: false })
    const hidden = await makeUser(db, { first_name: 'Hid', last_name: 'Den' })
    await roster(b.id, a.id, off.id)
    const second = await roster(a.id) // Ann is in a second department: still one row
    await db.from('department_member').update({ is_active: false }).eq('department_id', second.id)
    const { data: d } = await db.from('department').insert({ name: 'X', slug: `x-${Date.now()}` }).select().single()
    await db.from('department_member').insert({ department_id: d!.id, user_id: hidden.id, is_active: false })

    const staff = await findActiveStaff(db)
    expect(staff.map((s) => s.firstName)).toEqual(['Bob', 'Ann'])
  })

  it('shows the username when a user has no name', () => {
    expect(staffDisplayName({ firstName: '', lastName: '', username: 'tt' })).toBe('tt')
    expect(staffDisplayName({ firstName: 'Tess', lastName: 'T', username: 'tt' })).toBe('Tess T')
  })
})
