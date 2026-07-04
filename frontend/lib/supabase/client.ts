import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
}
