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
    return { departmentId: dept!.id as number, createdDepartment, userIds }
  },

  /** True when a legacy `users` row exists for this email (B140: edit rights must not depend on it). */
  async hasLegacyUserRow(email: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('users').select('id').eq('email', email).maybeSingle()
    if (error) throw new Error(`hasLegacyUserRow: ${error.message}`)
    return !!data
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

  /** Another user's save: changes the shift's notes behind an open dialog (the updated_at trigger bumps the row). */
  async touchShift({ id, notes }: { id: number; notes: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('schedule_shift').update({ notes }).eq('id', id)
    if (error) throw new Error(`touchShift: ${error.message}`)
    return null
  },

  async cleanLineSchedule({ departmentId, createdDepartment, userIds }: { departmentId: number; createdDepartment: boolean; userIds: number[] }) {
    const db = createE2EDbClient()
    await db.from('schedule_shift').delete().in('user_id', userIds)
    await db.from('department_member').delete().in('user_id', userIds)
    await db.from('users').delete().in('id', userIds)
    if (createdDepartment) await db.from('department').delete().eq('id', departmentId)
    return null
  }
}
