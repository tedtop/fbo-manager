'use server'

import { createClient } from '@/lib/supabase/server'
import type { profileFormSchema } from '@/lib/validation'
import type { z } from 'zod'

export type ProfileFormSchema = z.infer<typeof profileFormSchema>

export async function profileAction(data: ProfileFormSchema): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: data.firstName,
      last_name: data.lastName
    }
  })

  return !error
}
