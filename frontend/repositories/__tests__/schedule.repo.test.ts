import { beforeEach, describe, expect, it } from 'vitest'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeUser } from '@/tests/support/factories'
import { findActiveDepartments, findActiveMembers, findDepartmentBySlug } from '@/repositories/departments.repo'
import { createShift, deleteShift, findShiftsByRange, updateShift } from '@/repositories/schedule.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

async function makeDepartment(slug = 'line', over: Record<string, unknown> = {}) {
  const { data, error } = await db.from('department').insert({ name: 'Line', slug, ...over }).select().single()
  if (error) throw error
  return data
}

async function addMember(departmentId: number, userId: number, over: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from('department_member')
    .insert({ department_id: departmentId, user_id: userId, ...over })
    .select()
    .single()
  if (error) throw error
  return data
}

describe('departments.repo', () => {
  it('lists active departments by name and finds one by slug', async () => {
    await makeDepartment('line', { name: 'Line' })
    await makeDepartment('front-desk', { name: 'Front Desk' })
    await makeDepartment('old', { name: 'Old', is_active: false })

    expect((await findActiveDepartments(db)).map((d) => d.slug)).toEqual(['front-desk', 'line'])
    expect((await findDepartmentBySlug(db, 'line'))?.name).toBe('Line')
    expect(await findDepartmentBySlug(db, 'nope')).toBeNull()
  })

  it('defaults a new department to self-edit with lead and supervisor editors', async () => {
    const dept = await makeDepartment()
    expect(dept.settings).toEqual({ allow_self_edit: true, edit_roles: ['lead', 'supervisor'] })
  })

  it('returns active members in display order, with the user joined, and skips inactive ones', async () => {
    const dept = await makeDepartment()
    const a = await makeUser(db, { first_name: 'Ann', last_name: 'A' })
    const b = await makeUser(db, { first_name: 'Bob', last_name: 'B' })
    const c = await makeUser(db, { first_name: 'Cy', last_name: 'C' })
    await addMember(dept.id, a.id, { display_order: 2, dept_role: 'lead' })
    await addMember(dept.id, b.id, { display_order: 1 })
    await addMember(dept.id, c.id, { display_order: 3, is_active: false })

    const members = await findActiveMembers(db, dept.id)
    expect(members.map((m) => m.user?.first_name)).toEqual(['Bob', 'Ann'])
    expect(members[1].dept_role).toBe('lead')
  })

  it('refuses the same user twice in one department and an unknown dept_role', async () => {
    const dept = await makeDepartment()
    const u = await makeUser(db)
    await addMember(dept.id, u.id)
    await expect(addMember(dept.id, u.id)).rejects.toMatchObject({ code: '23505' })
    const u2 = await makeUser(db)
    await expect(addMember(dept.id, u2.id, { dept_role: 'boss' })).rejects.toMatchObject({ code: '23514' })
  })
})

describe('schedule.repo', () => {
  async function setup() {
    const dept = await makeDepartment()
    const user = await makeUser(db)
    await addMember(dept.id, user.id)
    return { dept, user }
  }
  const shiftOf = (departmentId: number, userId: number, over: Record<string, unknown> = {}) => ({
    department_id: departmentId, user_id: userId, shift_date: '2026-11-09', start_time: '05:00', end_time: '15:00', ...over,
  })

  it('creates a shift and reads it back with notes defaulting to empty', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id))
    expect(row).toMatchObject({ shift_date: '2026-11-09', start_time: '05:00:00', end_time: '15:00:00', notes: '' })
  })

  it('finds shifts inside the inclusive range for one department, ordered by date then start', async () => {
    const { dept, user } = await setup()
    const other = await makeDepartment('other')
    await createShift(db, shiftOf(dept.id, user.id, { shift_date: '2026-11-10', start_time: '14:00', end_time: '21:00' }))
    await createShift(db, shiftOf(dept.id, user.id, { shift_date: '2026-11-09', start_time: '14:00', end_time: '21:00' }))
    await createShift(db, shiftOf(dept.id, user.id, { shift_date: '2026-11-09', start_time: '05:00', end_time: '15:00' }))
    await createShift(db, shiftOf(dept.id, user.id, { shift_date: '2026-11-16' })) // outside
    await createShift(db, shiftOf(other.id, user.id)) // another department

    const rows = await findShiftsByRange(db, dept.id, '2026-11-09', '2026-11-10')
    expect(rows.map((r) => `${r.shift_date} ${r.start_time}`)).toEqual([
      '2026-11-09 05:00:00', '2026-11-09 14:00:00', '2026-11-10 14:00:00',
    ])
  })

  it('stores an overnight shift as written (end before start)', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id, { start_time: '22:00', end_time: '08:00' }))
    expect(row.start_time).toBe('22:00:00')
    expect(row.end_time).toBe('08:00:00')
  })

  it('updates a shift and records who changed it', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id))
    const updated = await updateShift(db, row.id, { start_time: '06:00', end_time: '16:00', notes: 'covering', updated_by: user.id })
    expect(updated).toMatchObject({ start_time: '06:00:00', end_time: '16:00:00', notes: 'covering', updated_by: user.id })
  })

  it('guards the update with expectedUpdatedAt: matches once, then a stale value throws ConcurrencyConflictError and writes nothing', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id))
    const loaded = row.updated_at

    const first = await updateShift(db, row.id, { notes: 'first' }, loaded)
    expect(first.notes).toBe('first')
    expect(new Date(first.updated_at).getTime()).toBeGreaterThan(new Date(loaded).getTime())

    // `loaded` is now stale, exactly like another user's save.
    await expect(updateShift(db, row.id, { notes: 'stale' }, loaded)).rejects.toBeInstanceOf(ConcurrencyConflictError)
    const { data } = await db.from('schedule_shift').select('notes').eq('id', row.id).single()
    expect(data?.notes).toBe('first')
  })

  it('without expectedUpdatedAt the update is unconditional (the Overwrite anyway path)', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id))
    await updateShift(db, row.id, { notes: 'theirs' })
    await expect(updateShift(db, row.id, { notes: 'ours' })).resolves.toMatchObject({ notes: 'ours' })
  })

  it('deletes a shift', async () => {
    const { dept, user } = await setup()
    const row = await createShift(db, shiftOf(dept.id, user.id))
    await deleteShift(db, row.id)
    expect(await findShiftsByRange(db, dept.id, '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('removes a user’s shifts when the user is deleted', async () => {
    const { dept, user } = await setup()
    await createShift(db, shiftOf(dept.id, user.id))
    await db.from('department_member').delete().eq('user_id', user.id)
    await db.from('users').delete().eq('id', user.id)
    expect(await findShiftsByRange(db, dept.id, '2026-11-01', '2026-11-30')).toEqual([])
  })
})
