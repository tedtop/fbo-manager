// B96: the database refuses any change that would leave no active Administrator (migration
// 20261113000500_last_active_admin_guard.sql). Runs against the local stack only (see tests/support/client.ts).
// The local DB may already hold real dev admins (admin@minutemanfbo.local), so each test isolates itself: it
// creates its own users, temporarily disables every other active admin (allowed while a test admin is active),
// and afterEach re-enables them before deleting the test users.
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { findAllRoles } from '@/repositories/roles.repo'
import { assignRole, setUserRoles } from '@/repositories/user-roles.repo'
import { LAST_ADMIN_SQLSTATE, lastAdminDbError } from '@/lib/user-guards'
import { createTestClient } from '@/tests/support/client'

const db = createTestClient()

let created: string[] = []
let disabledByTest: string[] = []

async function roleId(name: string): Promise<number> {
  const roles = await findAllRoles(db)
  const role = roles.find((r) => r.name === name)
  if (!role) throw new Error(`role ${name} missing`)
  return role.id
}

async function makeUser(roleName: string | null): Promise<string> {
  const email = `b96-${Math.random().toString(36).slice(2, 10)}@example.com`
  const { data, error } = await db.auth.admin.createUser({ email, password: 'pw-b96-test', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  created.push(data.user.id)
  // the handle_new_auth_user trigger creates the profile; wait for it
  for (let i = 0; i < 20; i++) {
    const { data: p } = await db.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
    if (p) break
    await new Promise((r) => setTimeout(r, 100))
  }
  if (roleName) await assignRole(db, data.user.id, await roleId(roleName), null)
  return data.user.id
}

/** Disable every active Administrator that is not one of `keep` (the test's own), so the test controls the count. */
async function isolateAdmins(keep: string[]) {
  const adminRoleId = await roleId('Administrator')
  const { data, error } = await db
    .from('user_roles')
    .select('user_id, profiles!inner(status)')
    .eq('role_id', adminRoleId)
    .eq('profiles.status', 'active')
  if (error) throw error
  for (const row of data ?? []) {
    if (keep.includes(row.user_id)) continue
    const { error: e } = await db.from('profiles').update({ status: 'disabled' }).eq('id', row.user_id)
    if (e) throw e
    disabledByTest.push(row.user_id)
  }
}

async function activeAdminCount(): Promise<number> {
  const adminRoleId = await roleId('Administrator')
  const { data, error } = await db
    .from('user_roles')
    .select('user_id, profiles!inner(status)')
    .eq('role_id', adminRoleId)
    .eq('profiles.status', 'active')
  if (error) throw error
  return data?.length ?? 0
}

afterEach(async () => {
  for (const id of disabledByTest) await db.from('profiles').update({ status: 'active' }).eq('id', id)
  disabledByTest = []
  for (const id of created) await db.auth.admin.deleteUser(id)
  created = []
})

describe('last active Administrator guard (database)', () => {
  it('refuses removing the Administrator role from the last active admin', async () => {
    const admin = await makeUser('Administrator')
    await isolateAdmins([admin])
    expect(await activeAdminCount()).toBe(1)

    await expect(setUserRoles(db, admin, [await roleId('Front Desk')], null)).rejects.toMatchObject({ code: LAST_ADMIN_SQLSTATE })
    // refused: still an admin (the Front Desk insert ran first and is harmless)
    expect(await activeAdminCount()).toBe(1)

    // a raw delete and a raw role swap are refused too
    const adminRoleId = await roleId('Administrator')
    const del = await db.from('user_roles').delete().eq('user_id', admin).eq('role_id', adminRoleId)
    expect(del.error?.code).toBe(LAST_ADMIN_SQLSTATE)
    expect(lastAdminDbError(del.error)).toBe('At least one active Administrator is required.')
    const swap = await db.from('user_roles').update({ role_id: await roleId('Line Department') }).eq('user_id', admin).eq('role_id', adminRoleId)
    expect(swap.error?.code).toBe(LAST_ADMIN_SQLSTATE)
    expect(await activeAdminCount()).toBe(1)
  })

  it('refuses deactivating the last active admin', async () => {
    const admin = await makeUser('Administrator')
    await isolateAdmins([admin])

    const { error } = await db.from('profiles').update({ status: 'disabled' }).eq('id', admin)
    expect(error?.code).toBe(LAST_ADMIN_SQLSTATE)
    const { data } = await db.from('profiles').select('status').eq('id', admin).single()
    expect(data?.status).toBe('active')
  })

  it('refuses deleting the last active admin (profile and auth user)', async () => {
    const admin = await makeUser('Administrator')
    await isolateAdmins([admin])

    const profileDelete = await db.from('profiles').delete().eq('id', admin)
    expect(profileDelete.error?.code).toBe(LAST_ADMIN_SQLSTATE)

    const authDelete = await db.auth.admin.deleteUser(admin)
    expect(authDelete.error).not.toBeNull()
    const { data } = await db.from('profiles').select('id').eq('id', admin).maybeSingle()
    expect(data?.id).toBe(admin)
  })

  it('allows demoting, deactivating and deleting an admin while another active admin remains', async () => {
    const a = await makeUser('Administrator')
    const b = await makeUser('Administrator')
    const c = await makeUser('Administrator')
    await isolateAdmins([a, b, c])
    expect(await activeAdminCount()).toBe(3)

    await setUserRoles(db, a, [await roleId('Front Desk')], null) // demote
    expect(await activeAdminCount()).toBe(2)

    const off = await db.from('profiles').update({ status: 'disabled' }).eq('id', b) // deactivate
    expect(off.error).toBeNull()
    expect(await activeAdminCount()).toBe(1)

    // c is now the last one
    const lastOff = await db.from('profiles').update({ status: 'disabled' }).eq('id', c)
    expect(lastOff.error?.code).toBe(LAST_ADMIN_SQLSTATE)

    // reactivating b and then deleting c's account works (b remains)
    await db.from('profiles').update({ status: 'active' }).eq('id', b)
    const del = await db.auth.admin.deleteUser(c)
    expect(del.error).toBeNull()
    expect(await activeAdminCount()).toBe(1)
  })

  it('does not count a disabled admin as active', async () => {
    const a = await makeUser('Administrator')
    const b = await makeUser('Administrator')
    await isolateAdmins([a, b])
    await db.from('profiles').update({ status: 'disabled' }).eq('id', b)
    // only a is active: a cannot be demoted even though b still holds the role
    await expect(setUserRoles(db, a, [], null)).rejects.toMatchObject({ code: LAST_ADMIN_SQLSTATE })
    // reactivate b so afterEach cleanup can delete both
    await db.from('profiles').update({ status: 'active' }).eq('id', b)
  })

  it('replacing roles while keeping Administrator works, even for the last admin', async () => {
    const admin = await makeUser('Administrator')
    await isolateAdmins([admin])

    await setUserRoles(db, admin, [await roleId('Administrator'), await roleId('Front Desk')], null)
    expect(await activeAdminCount()).toBe(1)
    await setUserRoles(db, admin, [await roleId('Administrator')], null)
    await setUserRoles(db, admin, [await roleId('Administrator')], null) // no-op
    expect(await activeAdminCount()).toBe(1)
    const { data } = await db.from('user_roles').select('role_id').eq('user_id', admin)
    expect((data ?? []).map((r) => r.role_id)).toEqual([await roleId('Administrator')])
  })

  it('never blocks changes to non-admin users', async () => {
    const admin = await makeUser('Administrator')
    const clerk = await makeUser('Front Desk')
    await isolateAdmins([admin])

    await setUserRoles(db, clerk, [await roleId('Line Department')], null)
    const off = await db.from('profiles').update({ status: 'disabled' }).eq('id', clerk)
    expect(off.error).toBeNull()
    const del = await db.auth.admin.deleteUser(clerk)
    expect(del.error).toBeNull()
    created = created.filter((id) => id !== clerk)
  })

  it('allows inserting the first admin when there is no admin at all (bootstrap)', () => {
    // Zero admins cannot be reached through the guarded paths, so this runs one SQL block that bypasses the
    // triggers to empty the Administrator role, then checks bootstrap and non-admin changes pass at commit,
    // and finally raises ROLLBACK_OK so nothing persists.
    const sql = `
DO $$
DECLARE uid uuid; rid int; fd int;
BEGIN
  SET LOCAL session_replication_role = replica;
  DELETE FROM user_roles WHERE role_id = (SELECT id FROM roles WHERE name = 'Administrator');
  SET LOCAL session_replication_role = origin;
  SELECT id INTO rid FROM roles WHERE name = 'Administrator';
  SELECT id INTO fd FROM roles WHERE name = 'Front Desk';
  SELECT id INTO uid FROM profiles LIMIT 1;
  -- the profile may already hold Front Desk (shared local data), so the insert must not hit the unique key
  INSERT INTO user_roles (user_id, role_id) VALUES (uid, fd) ON CONFLICT DO NOTHING;
  DELETE FROM user_roles WHERE user_id = uid AND role_id = fd; -- a non-admin change with zero admins
  INSERT INTO user_roles (user_id, role_id) VALUES (uid, rid); -- bootstrap the first admin
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION 'ROLLBACK_OK';
END $$;`
    const dbUrl = process.env.SUPABASE_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    let output = ''
    try {
      output = execFileSync('pnpm', ['exec', 'supabase', 'db', 'query', '--db-url', dbUrl, sql], { encoding: 'utf8', stdio: 'pipe' })
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`
    }
    expect(output).toContain('ROLLBACK_OK')
    expect(output).not.toContain(LAST_ADMIN_SQLSTATE)
  })
})
