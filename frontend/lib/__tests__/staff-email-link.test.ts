import { normalizeEmail, setStaffRealEmail } from '@/lib/staff-email-link'
import { describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

/** Minimal in-memory stand-in for the service-role client: select/update with eq + ilike, plus auth.admin. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const calls = { deleteUser: [] as string[], updateUserById: [] as Array<[string, any]> }
  const from = (name: string) => {
    let rows = tables[name] ?? []
    let patch: Row | null = null
    const q: any = {
      select: () => q,
      update: (p: Row) => {
        patch = p
        return q
      },
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val)
        return q
      },
      ilike: (col: string, val: string) => {
        rows = rows.filter((r) => String(r[col]).toLowerCase() === val.toLowerCase())
        return q
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (patch) for (const r of rows) Object.assign(r, patch)
        resolve({ data: rows, error: null })
      }
    }
    return q
  }
  const admin = {
    from,
    auth: {
      admin: {
        deleteUser: vi.fn(async (id: string) => {
          calls.deleteUser.push(id)
          return { error: null }
        }),
        updateUserById: vi.fn(async (id: string, attrs: any) => {
          calls.updateUserById.push([id, attrs])
          return { error: null }
        })
      }
    }
  }
  return { admin: admin as any, calls }
}

const base = () => ({
  profiles: [
    { id: 'staff-1', email: 'jane.doe@minutemanfbo.local', status: 'active' },
    { id: 'google-1', email: 'jane@gmail.com', status: 'active' },
    { id: 'admin-1', email: 'admin@minutemanfbo.local', status: 'active' }
  ],
  user_roles: [{ id: 1, user_id: 'admin-1' }] as Row[],
  users: [{ id: 7, email: 'jane.doe@minutemanfbo.local' }]
})

describe('normalizeEmail', () => {
  it('trims, lowercases and rejects junk', () => {
    expect(normalizeEmail('  Jane@Gmail.COM ')).toBe('jane@gmail.com')
    expect(normalizeEmail('nope')).toBeNull()
    expect(normalizeEmail('a b@c.com')).toBeNull()
    expect(normalizeEmail(42)).toBeNull()
  })
})

describe('setStaffRealEmail: entry point 1 (admin types the email)', () => {
  it('replaces the placeholder in auth, profiles and users, with a random password', async () => {
    const t = base()
    const { admin, calls } = fakeAdmin(t)
    const res = await setStaffRealEmail(admin, { targetId: 'staff-1', email: 'Jane.D@Gmail.com', callerId: 'admin-1' })
    expect(res).toEqual({ ok: true, email: 'jane.d@gmail.com', deletedUserId: null, staffRowUpdated: true })
    expect(t.profiles[0].email).toBe('jane.d@gmail.com')
    expect(t.users[0].email).toBe('jane.d@gmail.com')
    const [id, attrs] = calls.updateUserById[0]
    expect(id).toBe('staff-1')
    expect(attrs.email).toBe('jane.d@gmail.com')
    expect(attrs.email_confirm).toBe(true)
    expect(attrs.password.length).toBeGreaterThanOrEqual(32)
    expect(calls.deleteUser).toEqual([])
  })

  it('uses a different password every time', async () => {
    const a = fakeAdmin(base())
    const b = fakeAdmin(base())
    await setStaffRealEmail(a.admin, { targetId: 'staff-1', email: 'x1@gmail.com', callerId: 'admin-1' })
    await setStaffRealEmail(b.admin, { targetId: 'staff-1', email: 'x1@gmail.com', callerId: 'admin-1' })
    expect(a.calls.updateUserById[0][1].password).not.toBe(b.calls.updateUserById[0][1].password)
  })

  it('works for an account with no staff row (reports staffRowUpdated false)', async () => {
    const t = base()
    t.users = []
    const { admin } = fakeAdmin(t)
    const res = await setStaffRealEmail(admin, { targetId: 'staff-1', email: 'new@gmail.com', callerId: 'admin-1' })
    expect(res).toMatchObject({ ok: true, staffRowUpdated: false })
  })

  it.each([
    ['invalid email', { email: 'nope' }, 400],
    ['own account', { targetId: 'admin-1', email: 'me@gmail.com' }, 400],
    ['unknown account', { targetId: 'ghost', email: 'me@gmail.com' }, 404],
    ['email held by another auth account', { email: 'jane@gmail.com' }, 409]
  ])('rejects %s without changing anything', async (_n, over, status) => {
    const t = base()
    const { admin, calls } = fakeAdmin(t)
    const res = await setStaffRealEmail(
      admin,
      Object.assign({ targetId: 'staff-1', callerId: 'admin-1', email: 'x@gmail.com' }, over)
    )
    expect(res).toMatchObject({ ok: false, status })
    expect(calls.updateUserById).toEqual([])
    expect(calls.deleteUser).toEqual([])
    expect(t.profiles[0].email).toBe('jane.doe@minutemanfbo.local')
  })

  it('rejects an email already on a staff record', async () => {
    const t = base()
    t.users.push({ id: 8, email: 'taken@gmail.com' })
    const { admin } = fakeAdmin(t)
    const res = await setStaffRealEmail(admin, { targetId: 'staff-1', email: 'taken@gmail.com', callerId: 'admin-1' })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })
})

describe('setStaffRealEmail: entry point 2 (link an Awaiting-access Google sign-up)', () => {
  it('deletes the Google auth user first, then applies the email to the staff account', async () => {
    const t = base()
    const { admin, calls } = fakeAdmin(t)
    const res = await setStaffRealEmail(admin, {
      targetId: 'staff-1',
      email: 'jane@gmail.com',
      linkFromUserId: 'google-1',
      callerId: 'admin-1'
    })
    expect(res).toEqual({ ok: true, email: 'jane@gmail.com', deletedUserId: 'google-1', staffRowUpdated: true })
    expect(calls.deleteUser).toEqual(['google-1'])
    expect(calls.updateUserById[0][0]).toBe('staff-1')
    expect(admin.auth.admin.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      admin.auth.admin.updateUserById.mock.invocationCallOrder[0]
    )
  })

  it('refuses to delete a sign-up that already holds a role', async () => {
    const t = base()
    t.user_roles.push({ id: 2, user_id: 'google-1' })
    const { admin, calls } = fakeAdmin(t)
    const res = await setStaffRealEmail(admin, {
      targetId: 'staff-1',
      email: 'jane@gmail.com',
      linkFromUserId: 'google-1',
      callerId: 'admin-1'
    })
    expect(res).toMatchObject({ ok: false, status: 409 })
    expect(calls.deleteUser).toEqual([])
  })

  it('refuses when the sign-up email differs from the email to set', async () => {
    const { admin, calls } = fakeAdmin(base())
    const res = await setStaffRealEmail(admin, {
      targetId: 'staff-1',
      email: 'other@gmail.com',
      linkFromUserId: 'google-1',
      callerId: 'admin-1'
    })
    expect(res).toMatchObject({ ok: false, status: 400 })
    expect(calls.deleteUser).toEqual([])
  })

  it('refuses to link the sign-up to itself or to the caller', async () => {
    const { admin } = fakeAdmin(base())
    expect(
      await setStaffRealEmail(admin, { targetId: 'staff-1', email: 'jane@gmail.com', linkFromUserId: 'staff-1', callerId: 'admin-1' })
    ).toMatchObject({ ok: false, status: 400 })
    expect(
      await setStaffRealEmail(admin, { targetId: 'staff-1', email: 'jane@gmail.com', linkFromUserId: 'admin-1', callerId: 'admin-1' })
    ).toMatchObject({ ok: false, status: 400 })
  })
})
