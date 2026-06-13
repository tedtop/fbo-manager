'use server'

import { createClient } from '@/lib/supabase/server'
import type { deleteAccountFormSchema } from '@/lib/validation'
import type { z } from 'zod'

export type DeleteAccountFormSchema = z.infer<typeof deleteAccountFormSchema>

export async function deleteAccountAction(
  _data: DeleteAccountFormSchema
): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase.auth.admin.deleteUser(user.id)
  return !error
}
