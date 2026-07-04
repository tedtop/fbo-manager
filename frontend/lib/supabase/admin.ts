import { getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS entirely — server-only.
 * Never import this from a 'use client' component or expose it to the browser.
 * Used for admin operations (auth.admin.*) that the anon key cannot perform,
 * e.g. inviting or deleting a Supabase auth user.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
