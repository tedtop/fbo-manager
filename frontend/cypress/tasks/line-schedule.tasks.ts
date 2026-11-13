// Cypress tasks for the Line Schedule spec (service role, local stack only: see ./env.ts).
// The page shows the department with slug "line"; the spec creates it only when the stack has none,
// and removes only what it created.
import { createE2EDbClient } from './db'

export const lineScheduleTasks = {
  /** Two staff users on the "line" roster ({stamp} in their names), the department if missing, no shifts. */
  async seedLineSchedule(stamp: string) {
    const db = createE2EDbClient()
    const fail = (what: string, e: { message: string } | null) => {
      if (e) throw new Error(`seedLineSchedule ${what}: ${e.message}`)
    }
    let { data: dept } = await db.from('department').select('id').eq('slug', 'line').maybeSingle()
    let createdDepartment = false
    if (!dept) {
      const created = await db.from('department').insert({ name: 'Line', slug: 'line' }).select('id').single()
      fail('department', created.error)
      dept = created.data
      createdDepartment = true
    }
    // The page decides who may edit from the legacy `users` row matching the signed-in email (useCurrentUser),
    // which the dev accounts do not have on a fresh stack: add the admin's row for the run.
    const adminEmail = 'admin@minutemanfbo.local'
    const { data: existing } = await db.from('users').select('id').eq('email', adminEmail).maybeSingle()
    let adminRowId: number | null = null
    if (!existing) {
      const a = await db
        .from('users')
        .insert({ username: 'cy-dev-admin', email: adminEmail, password: 'x', first_name: 'Dev', last_name: 'Admin', role: 'admin' })
        .select('id')
        .single()
      fail('admin row', a.error)
      adminRowId = a.data!.id
    }
    const userIds: number[] = []
    for (const [i, who] of ['Alpha', 'Bravo'].entries()) {
      const u = await db
        .from('users')
        .insert({ username: `cysched-${who.toLowerCase()}-${stamp}`, password: 'x', first_name: `Cy${who}`, last_name: `Sched${stamp}`, role: 'line' })
        .select('id')
        .single()
      fail(`user ${who}`, u.error)
      userIds.push(u.data!.id)
      const m = await db.from('department_member').insert({ department_id: dept!.id, user_id: u.data!.id, display_order: 900 + i })
      fail(`member ${who}`, m.error)
    }
    return { departmentId: dept!.id as number, createdDepartment, userIds, adminRowId }
  },

  async addShift({ departmentId, userId, date, start, end }: { departmentId: number; userId: number; date: string; start: string; end: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('schedule_shift').insert({ department_id: departmentId, user_id: userId, shift_date: date, start_time: start, end_time: end })
    if (error) throw new Error(`addShift: ${error.message}`)
    return null
  },

  async getShifts(userIds: number[]) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('schedule_shift').select('*').in('user_id', userIds).order('shift_date')
    if (error) throw new Error(`getShifts: ${error.message}`)
    return data ?? []
  },

  async cleanLineSchedule({ departmentId, createdDepartment, userIds, adminRowId }: { departmentId: number; createdDepartment: boolean; userIds: number[]; adminRowId: number | null }) {
    const db = createE2EDbClient()
    await db.from('schedule_shift').delete().in('user_id', userIds)
    await db.from('department_member').delete().in('user_id', userIds)
    await db.from('users').delete().in('id', userIds)
    if (adminRowId) await db.from('users').delete().eq('id', adminRowId)
    if (createdDepartment) await db.from('department').delete().eq('id', departmentId)
    return null
  }
}
