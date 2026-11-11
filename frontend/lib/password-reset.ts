import { z } from 'zod'

/** Where the page that sets the new password lives; reachable only with the recovery session. */
export const RESET_PASSWORD_PATH = '/reset-password'

/**
 * Redirect target for `supabase.auth.resetPasswordForEmail`. The emailed link lands on the OAuth/PKCE
 * callback (one route that trades the `code` for a session) and is then sent on to the reset page.
 * The origin must be covered by the Supabase "Redirect URLs" allow list (`https://<site>/**`).
 */
export function resetRedirectUrl(origin: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(RESET_PASSWORD_PATH)}`
}

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email')
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    passwordRetype: z.string().min(1, 'Retype the password')
  })
  .refine((d) => d.password === d.passwordRetype, {
    message: 'Passwords are not matching',
    path: ['passwordRetype']
  })

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
