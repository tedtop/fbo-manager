// Seed + roll forward the Line Service schedule.
//
// Source: the posted weekly sheet headed "Starting 10/11/26" (Mon-Sun grid, 11 people).
// The same weekly pattern repeats every week from SCHEDULE_START. Each run fills every
// week from SCHEDULE_START through the end of NEXT week (relative to today), so running
// it weekly keeps the board one week ahead. A week that already has any shifts for the
// department is left alone (manual edits survive); pass --force to replace the window.
// Members who are not on the sheet (and use the @example.com seed addresses) are marked
// inactive rather than deleted.
//
// Idempotent: safe to re-run. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
//
// Usage: cd frontend && set -a && source .env.local && set +a && node scripts/seed-line-schedule.mjs [--force]

import { createClient } from '@supabase/supabase-js'

const DEFAULT_PASSWORD = 'FBOline2026!'
// Placeholder address (first.last@) until the person signs in with Google; replace with their real email then.
const EMAIL_DOMAIN = 'minutemanfbo.local'
const LEGACY_DOMAIN = 'example.com'
const FORCE = process.argv.includes('--force')
// Monday of the first week the posted sheet applies to (sheet says 10/11/26, a Sunday;
// the grid is Mon-Sun so the first full week starts Mon 10/12).
const SCHEDULE_START = '2026-10-12'

// day: 0=Mon ... 6=Sun. end <= start means the shift crosses midnight.
const EMPLOYEES = [
  { first: 'Keith', last: 'Leathers', legacy: 'keith.l', tag: 'KL-40', deptRole: 'lead', title: 'Lead Supervisor', hours: 40,
    shifts: [[0, '10:00', '20:00'], [1, '10:00', '20:00'], [5, '10:00', '20:00'], [6, '10:00', '20:00']] },
  { first: 'Kelby', last: 'Grussling', legacy: 'kelby.g', tag: 'KG-40', deptRole: 'supervisor', title: 'Supervisor', hours: 40,
    shifts: [[1, '05:00', '15:00'], [2, '05:00', '15:00'], [3, '05:00', '15:00'], [4, '05:00', '15:00']] },
  { first: 'Troy', last: 'Sheehan', legacy: 'troy.s', tag: 'TS-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[2, '06:00', '16:00'], [3, '06:00', '16:00'], [4, '06:00', '16:00'], [5, '05:00', '15:00']] },
  { first: 'Carson', last: 'Strawbridge', legacy: 'carson.s', tag: 'CS-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '12:00', '22:00'], [1, '12:00', '22:00'], [5, '12:00', '22:00'], [6, '12:00', '22:00']] },
  { first: 'Ted', last: 'Toporkov', legacy: 'ted.t', tag: 'TT-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '22:00', '08:00'], [1, '22:00', '08:00'], [2, '22:00', '08:00'], [6, '22:00', '08:00']] },
  { first: 'Garrett', last: 'Lowe', legacy: 'garret.l', tag: 'GL-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[3, '12:00', '22:00'], [4, '14:00', '00:00'], [5, '14:00', '00:00'], [6, '12:00', '22:00']] },
  { first: 'Anakin', last: 'Kolberg', legacy: 'anikin', tag: 'AN-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '05:00', '15:00'], [1, '06:00', '16:00'], [2, '10:00', '20:00'], [3, '10:00', '20:00']] },
  { first: 'Dennis', last: 'Fuss', legacy: 'dennis.f', tag: 'DF-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[2, '12:00', '22:00'], [3, '14:00', '00:00'], [4, '12:00', '22:00'], [5, '08:00', '18:00']] },
  { first: 'Kai', last: 'Hargrave', legacy: 'kai.h', tag: 'KH-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '06:00', '16:00'], [1, '12:00', '22:00'], [2, '10:00', '20:00'], [6, '06:00', '16:00']] },
  { first: 'John', last: 'Haines', legacy: 'john.h', tag: 'JH-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '05:00', '15:00'], [1, '05:00', '15:00'], [4, '09:00', '19:00'], [6, '05:00', '15:00']] },
  { first: 'Mike', last: 'Prather', legacy: 'michael.p', tag: 'MP-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[3, '06:00', '16:00'], [4, '06:00', '16:00'], [5, '06:00', '16:00'], [6, '05:00', '15:00']] },
]

function slugName(emp) {
  return `${emp.first}.${emp.last}`.toLowerCase().replace(/[^a-z.]/g, '')
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}
const db = createClient(url, serviceKey)

async function main() {
  const { data: dept, error: deptErr } = await db
    .from('department').select('id').eq('slug', 'line').single()
  if (deptErr) throw deptErr

  const { data: admin } = await db
    .from('users').select('id').eq('role', 'admin').order('id').limit(1).single()
  const adminId = admin?.id ?? null

  const userIds = {}

  const authByEmail = new Map()
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    data.users.forEach((u) => authByEmail.set(u.email, u))
    if (data.users.length < 200) break
  }

  for (const emp of EMPLOYEES) {
    const username = emp.email ? emp.email.split('@')[0] : slugName(emp)
    const email = emp.email ?? `${username}@${EMAIL_DOMAIN}`
    const legacyEmail = emp.legacy ? `${emp.legacy}@${LEGACY_DOMAIN}` : null
    const fullName = `${emp.first} ${emp.last}`

    // 1. Auth user: create, or move a legacy seed account to the new address/name
    let authUser = authByEmail.get(email)
    if (!authUser && legacyEmail && authByEmail.get(legacyEmail)) {
      const { data, error } = await db.auth.admin.updateUserById(authByEmail.get(legacyEmail).id, {
        email, email_confirm: true, user_metadata: { full_name: fullName },
      })
      if (error) throw error
      authUser = data.user
      await db.from('profiles').update({ email, first_name: emp.first, last_name: emp.last }).eq('id', authUser.id)
      console.log(`auth: ${legacyEmail} -> ${email}`)
    } else if (!authUser) {
      const { data, error } = await db.auth.admin.createUser({
        email, password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
      })
      if (error) throw error
      authUser = data.user
      console.log(`auth: ${email} created`)
    }

    // 2. Application user row (role: line)
    const { data: existing } = await db.from('users').select('id')
      .in('email', legacyEmail ? [email, legacyEmail] : [email]).limit(1).maybeSingle()
    if (existing) {
      const { error } = await db.from('users')
        .update({ username, email, first_name: emp.first, last_name: emp.last, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
      userIds[username] = existing.id
    } else {
      const { data: created, error: userErr } = await db
        .from('users')
        .insert({
          username,
          email,
          first_name: emp.first,
          last_name: emp.last,
          role: 'line',
          employee_id: emp.tag,
          password: '!supabase-auth', // auth handled by Supabase, not Django
          is_active: true,
          is_staff: false,
          is_superuser: false,
          is_active_fueler: false,
          phone_number: '',
          date_joined: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (userErr) throw userErr
      userIds[username] = created.id
    }

    // 3. Department membership
    const { error: memberErr } = await db.from('department_member').upsert(
      {
        department_id: dept.id,
        user_id: userIds[username],
        dept_role: emp.deptRole,
        title: emp.title,
        target_weekly_hours: emp.hours,
        display_order: EMPLOYEES.indexOf(emp),
        is_active: true,
      },
      { onConflict: 'department_id,user_id' }
    )
    if (memberErr) throw memberErr
  }
  console.log(`users + memberships: ${Object.keys(userIds).length}`)

  // 4. Deactivate seeded members who are not on the current sheet
  const keep = new Set(Object.values(userIds))
  const { data: members } = await db
    .from('department_member').select('id, user_id, users(email)').eq('department_id', dept.id).eq('is_active', true)
  const stale = (members ?? []).filter((m) => !keep.has(m.user_id) && /@(example\.com|minutemanfbo\.local)$/.test(`${m.users?.email}`))
  if (stale.length) {
    const { error } = await db.from('department_member').update({ is_active: false }).in('id', stale.map((m) => m.id))
    if (error) throw error
    console.log(`deactivated: ${stale.map((m) => m.users.email).join(', ')}`)
  }

  // 5. Shifts: SCHEDULE_START week through the end of next week
  const today = new Date().toISOString().slice(0, 10)
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7 // 0=Mon
  const nextWeekEnd = addDays(today, 13 - dow)
  let inserted = 0
  for (let weekStart = SCHEDULE_START; addDays(weekStart, 6) <= nextWeekEnd; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6)
    const { count, error: cErr } = await db
      .from('schedule_shift').select('id', { count: 'exact', head: true })
      .eq('department_id', dept.id).gte('shift_date', weekStart).lte('shift_date', weekEnd)
    if (cErr) throw cErr
    if (count && !FORCE) { console.log(`skip ${weekStart}: ${count} shifts already present`); continue }
    if (count) {
      const { error } = await db.from('schedule_shift').delete()
        .eq('department_id', dept.id).gte('shift_date', weekStart).lte('shift_date', weekEnd)
      if (error) throw error
    }
    const rows = EMPLOYEES.flatMap((emp) => emp.shifts.map(([day, start, end]) => ({
      department_id: dept.id,
      user_id: userIds[emp.email ? emp.email.split('@')[0] : slugName(emp)],
      shift_date: addDays(weekStart, day),
      start_time: start,
      end_time: end,
      created_by: adminId,
    })))
    const { error } = await db.from('schedule_shift').insert(rows)
    if (error) throw error
    inserted += rows.length
    console.log(`week ${weekStart}: ${rows.length} shifts`)
  }
  console.log(`shifts inserted: ${inserted} (through ${nextWeekEnd})`)
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
