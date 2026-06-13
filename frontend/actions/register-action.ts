'use server'

import { createClient } from '@/lib/supabase/server'
import type { registerFormSchema } from '@/lib/validation'
import type { z } from 'zod'

export type RegisterFormSchema = z.infer<typeof registerFormSchema>

export async function registerAction(data: RegisterFormSchema): Promise<boolean | string> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: { username: data.username }
    }
  })

  if (error) return error.message
  return true
}
