import { describe, expect, it, vi } from 'vitest'
import { resolveCreatorId } from '../flight-creator'

// Minimal fake of the two calls resolveCreatorId makes: auth.getSession and from('users')...single().
function fakeDb(opts: { email?: string; row?: { id: number } | null; error?: { code: string } }) {
  const single = vi.fn().mockResolvedValue({ data: opts.row ?? null, error: opts.error ?? null })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const getSession = vi.fn().mockResolvedValue({
    data: { session: opts.email ? { user: { email: opts.email } } : null }
  })
  return { db: { auth: { getSession }, from } as never, from, eq }
}

describe('resolveCreatorId (B17)', () => {
  it('maps the signed-in email to the users row id', async () => {
    const { db, from, eq } = fakeDb({ email: 'tess@example.com', row: { id: 42 } })
    await expect(resolveCreatorId(db)).resolves.toBe(42)
    expect(from).toHaveBeenCalledWith('users')
    expect(eq).toHaveBeenCalledWith('email', 'tess@example.com')
  })

  it('returns undefined with no session (the DB default then applies)', async () => {
    const { db, from } = fakeDb({})
    await expect(resolveCreatorId(db)).resolves.toBeUndefined()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns undefined when no users row carries that email', async () => {
    const { db } = fakeDb({ email: 'nobody@example.com', row: null, error: { code: 'PGRST116' } })
    await expect(resolveCreatorId(db)).resolves.toBeUndefined()
  })

  it('returns undefined instead of failing the create when the lookup errors', async () => {
    const { db } = fakeDb({ email: 'x@example.com', row: null, error: { code: '42501' } })
    await expect(resolveCreatorId(db)).resolves.toBeUndefined()
  })
})
