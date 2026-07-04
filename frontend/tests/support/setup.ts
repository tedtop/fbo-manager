import { beforeAll } from 'vitest'
import { TEST_SUPABASE_URL } from './client'

// Fail fast with an actionable message instead of letting every test in the run time out
// against a connection refused error if the local Supabase stack isn't up yet.
beforeAll(async () => {
  try {
    const res = await fetch(`${TEST_SUPABASE_URL}/rest/v1/`, {
      signal: AbortSignal.timeout(3000)
    })
    // PostgREST answers on `/rest/v1/` even without an apikey (401/404 are both fine here —
    // we only care that something is listening).
    if (!res) throw new Error('no response')
  } catch (err) {
    throw new Error(
      `Could not reach the local Supabase REST API at ${TEST_SUPABASE_URL}.\nStart it first with: pnpm supabase:start (from frontend/)\nOriginal error: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}, 10_000)
