import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Standard local-dev demo keys that ship with every `supabase init` project — these are
// NOT secrets, they're baked into the Supabase CLI's default local JWT signing config and
// are the same across every local Supabase instance on every machine unless overridden.
// See https://supabase.com/docs/guides/local-development/cli/config#auth.
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const LOCAL_URL = 'http://127.0.0.1:54321'

export const TEST_SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? LOCAL_URL
const TEST_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY
export const TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? LOCAL_ANON_KEY

/**
 * Service-role client for repository integration tests. Bypasses RLS (there is none
 * defined in the test schema anyway) the same way server-side repository callers do
 * against the real project, and lets tests set up fixtures without fighting policies
 * that are out of scope for this suite.
 *
 * Points at the local Supabase stack started via `pnpm supabase:start` by default.
 * Override with SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY to run against a
 * different disposable Postgres+PostgREST instance (e.g. in CI).
 */
export function createTestClient(): SupabaseClient<Database> {
  return createClient<Database>(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
