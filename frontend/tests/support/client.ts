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

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * This test suite wipes every table it touches (see resetDatabase in ./reset.ts) — that's
 * only safe because it's aimed at a throwaway local Postgres container. Refuse to run
 * against anything that isn't loopback unless the caller opts in with BOTH an explicit
 * non-local SUPABASE_TEST_URL *and* this confirmation flag, so pointing the suite at the
 * wrong database takes two deliberate actions instead of one env var typo/copy-paste.
 */
export function assertSafeTestTarget(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`SUPABASE_TEST_URL is not a valid URL: "${url}"`)
  }

  if (LOOPBACK_HOSTS.has(host)) return

  if (process.env.SUPABASE_TEST_ALLOW_REMOTE !== 'yes-i-am-sure') {
    throw new Error(
      `Refusing to run repository tests against "${url}" — this suite calls resetDatabase(), ` +
        'which deletes every row in every table it knows about (tanks, transactions, users, ' +
        'invoices, ...). This is only safe against the local Supabase stack (127.0.0.1).\n\n' +
        'If you really mean to point this at a different disposable instance (e.g. a CI-only ' +
        'throwaway DB, never the live/shared project), set BOTH:\n' +
        '  SUPABASE_TEST_URL=<url>\n' +
        '  SUPABASE_TEST_ALLOW_REMOTE=yes-i-am-sure'
    )
  }
}

/**
 * Service-role client for repository integration tests. Bypasses RLS (there is none
 * defined in the test schema anyway) the same way server-side repository callers do
 * against the real project, and lets tests set up fixtures without fighting policies
 * that are out of scope for this suite.
 *
 * Points at the local Supabase stack started via `pnpm supabase:start` by default.
 * Override with SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY to run against a
 * different disposable Postgres+PostgREST instance (e.g. in CI) — see
 * assertSafeTestTarget() above for the guard rail on that override.
 */
export function createTestClient(): SupabaseClient<Database> {
  assertSafeTestTarget(TEST_SUPABASE_URL)
  return createClient<Database>(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
