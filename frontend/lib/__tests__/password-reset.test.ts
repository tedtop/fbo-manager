import { evaluateGate, isRouteOrChild, safeNextPath } from '@/lib/access'
import { forgotPasswordSchema, resetPasswordSchema, resetRedirectUrl } from '@/lib/password-reset'
import { describe, expect, it } from 'vitest'

describe('password reset', () => {
  it('redirects the emailed link through the callback to the reset page', () => {
    const url = resetRedirectUrl('https://minuteman.up.railway.app')
    expect(url).toBe('https://minuteman.up.railway.app/auth/callback?next=%2Freset-password')
    // the callback's own same-site check must keep this next path
    expect(safeNextPath(new URL(url).searchParams.get('next'))).toBe('/reset-password')
  })

  it('/forgot-password is public, /reset-password is not (needs the recovery session)', () => {
    expect(isRouteOrChild('/forgot-password', '/forgot-password')).toBe(true)
  })

  it('a role-less (pending) person with a recovery session can open /reset-password', () => {
    const pending = { status: 'active' as const, roles: [], access: {} }
    expect(evaluateGate('/reset-password', pending)).toEqual({ kind: 'allow' })
  })

  it('validates the forms', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false)
    expect(forgotPasswordSchema.safeParse({ email: ' a@b.co ' }).success).toBe(true)
    expect(resetPasswordSchema.safeParse({ password: 'short', passwordRetype: 'short' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: 'longenough1', passwordRetype: 'different11' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ password: 'longenough1', passwordRetype: 'longenough1' }).success).toBe(true)
  })
})
