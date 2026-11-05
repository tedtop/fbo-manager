import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const maybeSingle = vi.fn()
const findModuleAccessForUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })
  })
}))
vi.mock('@/repositories/user-roles.repo', () => ({ findModuleAccessForUser }))

const { denied, requireActiveUser, requireModule } = await import('../require-module')

const USER = { id: 'user-1' }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: USER } })
  maybeSingle.mockResolvedValue({ data: { status: 'active' } })
  findModuleAccessForUser.mockResolvedValue({ truck_sheets: 'view', fuel_farm: 'manage' })
})

describe('requireModule', () => {
  it('401 when nobody is signed in, without touching the profile or roles', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await requireModule('truck_sheets')).toEqual({
      ok: false,
      status: 401,
      error: 'Not authenticated'
    })
    expect(maybeSingle).not.toHaveBeenCalled()
    expect(findModuleAccessForUser).not.toHaveBeenCalled()
  })

  it('403 for a disabled account even though its roles still grant the module', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'disabled' } })
    expect(await requireModule('truck_sheets')).toMatchObject({ ok: false, status: 403 })
    expect(findModuleAccessForUser).not.toHaveBeenCalled()
  })

  it('403 when the profile row is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    expect(await requireModule('truck_sheets')).toMatchObject({ ok: false, status: 403 })
  })

  it('403 when the user has no access to the module', async () => {
    expect(await requireModule('invoicing')).toMatchObject({ ok: false, status: 403 })
  })

  it('403 for a role-less user', async () => {
    findModuleAccessForUser.mockResolvedValue({})
    expect(await requireModule('truck_sheets')).toMatchObject({ ok: false, status: 403 })
  })

  it('passes view access at the default level and returns the user', async () => {
    expect(await requireModule('truck_sheets')).toEqual({ ok: true, user: USER })
  })

  it('403 when view access is not enough for a manage gate, 200 path with manage', async () => {
    expect(await requireModule('truck_sheets', 'manage')).toMatchObject({ ok: false, status: 403 })
    expect(await requireModule('fuel_farm', 'manage')).toMatchObject({ ok: true })
  })

  it('500 when the access lookup throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    findModuleAccessForUser.mockRejectedValue(new Error('db down'))
    expect(await requireModule('truck_sheets')).toMatchObject({ ok: false, status: 500 })
  })
})

describe('requireActiveUser', () => {
  it('passes any active user, with or without roles', async () => {
    findModuleAccessForUser.mockResolvedValue({})
    expect(await requireActiveUser()).toEqual({ ok: true, user: USER })
    expect(findModuleAccessForUser).not.toHaveBeenCalled()
  })

  it('401 anonymous, 403 disabled', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await requireActiveUser()).toMatchObject({ ok: false, status: 401 })
    getUser.mockResolvedValue({ data: { user: USER } })
    maybeSingle.mockResolvedValue({ data: { status: 'disabled' } })
    expect(await requireActiveUser()).toMatchObject({ ok: false, status: 403 })
  })
})

describe('denied', () => {
  it('turns a failed check into a JSON response with its status', async () => {
    const res = denied({ ok: false, status: 403, error: 'nope' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'nope' })
  })
})
