'use server'

import { createClient } from '@/lib/supabase/server'
import type { changePasswordFormSchema } from '@/lib/validation'
import type { z } from 'zod'

export type ChangePasswordFormSchema = z.infer<typeof changePasswordFormSchema>

export async function changePasswordAction(
  data: ChangePasswordFormSchema
): Promise<boolean | string> {
  const supabase = await createClient()

  // Re-authenticate with current password before changing
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user?.email) return false

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: data.password
  })
  if (signInError) return 'Current password is incorrect'

  const { error } = await supabase.auth.updateUser({
    password: data.passwordNew
  })
  if (error) return error.message

  return true
}
