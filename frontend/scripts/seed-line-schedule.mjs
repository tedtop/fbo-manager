// Seed the Line Service department with employees + schedules.
// Employees/shift patterns transcribed from the posted paper schedule ("Starting Nov 6th").
// Idempotent: safe to re-run. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
//
// Usage: cd frontend && set -a && source .env.local && set +a && node scripts/seed-line-schedule.mjs

import { createClient } from '@supabase/supabase-js'

const DEFAULT_PASSWORD = 'FBOline2026!'
const EMAIL_DOMAIN = 'example.com'
// Mondays of the weeks to seed (covers June + July 2026 for week/month views)
const WEEK_STARTS = ['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']

// day: 0=Mon ... 6=Sun
const EMPLOYEES = [
  {
    first: 'Keith', last: 'L.', tag: 'KL-40', deptRole: 'lead', title: 'Lead Supervisor', hours: 40,
    shifts: [[0, '10:00', '20:00'], [1, '10:00', '20:00'], [5, '10:00', '20:00'], [6, '10:00', '20:00']],
  },
  {
    first: 'Kelby', last: 'G.', tag: 'KG-40', deptRole: 'supervisor', title: 'Supervisor', hours: 40,
    shifts: [[1, '05:00', '15:00'], [2, '05:00', '15:00'], [3, '05:00', '15:00'], [4, '05:00', '15:00']],
  },
  {
    first: 'Troy', last: 'S.', tag: 'TS-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[2, '06:00', '16:00'], [3, '06:00', '16:00'], [4, '06:00', '16:00'], [5, '05:00', '15:00']],
  },
  {
    first: 'Carson', last: 'S.', tag: 'CS-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[2, '12:00', '22:00'], [3, '12:00', '22:00'], [4, '12:00', '22:00'], [5, '12:00', '22:00'], [6, '22:00', '03:00']],
  },
  {
    first: 'Ted', last: 'T.', tag: 'TT-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '22:00', '08:00'], [1, '22:00', '08:00'], [2, '22:00', '08:00'], [6, '12:00', '22:00']],
  },
  {
    first: 'Garret', last: 'L.', tag: 'GL-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[0, '12:00', '22:00'], [1, '12:00', '22:00'], [5, '12:00', '22:00'], [6, '12:00', '22:00']],
  },
  {
    first: 'Tate', last: 'T.', tag: 'TT-30', deptRole: 'member', title: '', hours: 30,
    shifts: [[3, '14:00', '21:00'], [4, '14:00', '21:00'], [5, '14:00', '21:00'], [6, '14:00', '21:00']],
  },
  {
    first: 'Jake', last: 'R.', tag: 'JR-32', deptRole: 'member', title: '', hours: 32,
    shifts: [[0, '05:00', '15:00'], [1, '05:00', '15:00'], [6, '05:00', '15:00']],
  },
  {
    first: 'John', last: 'H.', tag: 'JH-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[2, '10:00', '20:00'], [3, '10:00', '20:00'], [4, '10:00', '20:00'], [5, '08:00', '18:00']],
  },
  {
    first: 'Michael', last: 'P.', tag: 'MP-40', deptRole: 'member', title: '', hours: 40,
    shifts: [[5, '05:00', '15:00'], [6, '05:00', '15:00']],
  },
]

function slugName(emp) {
  return `${emp.first.toLowerCase()}.${emp.last[0].toLowerCase()}`
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

  for (const emp of EMPLOYEES) {
    const username = slugName(emp)
    const email = `${username}@${EMAIL_DOMAIN}`

    // 1. Auth user (skip if already registered)
    const { error: authErr } = await db.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${emp.first} ${emp.last}` },
    })
    if (authErr && !`${authErr.message}`.match(/already|exists/i)) throw authErr
    console.log(`auth: ${email} ${authErr ? '(already exists)' : 'created'}`)

    // 2. Application user row (role: line)
    const { data: existing } = await db.from('users').select('id').eq('email', email).maybeSingle()
    if (existing) {
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
          modified_at: new Date().toISOString(),
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

  // 4. Shifts: wipe the seeded window, then insert the weekly pattern
  const rangeStart = WEEK_STARTS[0]
  const rangeEnd = addDays(WEEK_STARTS[WEEK_STARTS.length - 1], 6)
  const { error: delErr } = await db
    .from('schedule_shift')
    .delete()
    .eq('department_id', dept.id)
    .gte('shift_date', rangeStart)
    .lte('shift_date', rangeEnd)
  if (delErr) throw delErr

  const rows = []
  for (const weekStart of WEEK_STARTS) {
    for (const emp of EMPLOYEES) {
      for (const [day, start, end] of emp.shifts) {
        rows.push({
          department_id: dept.id,
          user_id: userIds[slugName(emp)],
          shift_date: addDays(weekStart, day),
          start_time: start,
          end_time: end,
          created_by: adminId,
        })
      }
    }
  }
  const { error: shiftErr } = await db.from('schedule_shift').insert(rows)
  if (shiftErr) throw shiftErr
  console.log(`shifts: ${rows.length} (${rangeStart} → ${rangeEnd})`)
  console.log(`\nDone. Employee login: <first>.<last-initial>@${EMAIL_DOMAIN} / ${DEFAULT_PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
