import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_SUPABASE_URL, assertSafeE2ETarget } from './env'

/**
 * Service-role client for asserting on DB state directly from a spec — e.g. "after
 * submitting the create-equipment form, does a matching row actually exist?" This is the
 * crux of what this whole E2E layer is for: a form can render successfully and show a
 * success toast while silently never having called the repository/persistence path. Only
 * a real DB read after the UI interaction proves it worked.
 */
export function createE2EDbClient(): SupabaseClient<Database> {
  assertSafeE2ETarget(E2E_SUPABASE_URL)
  return createClient<Database>(E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Polls until `check` returns a truthy value or the timeout elapses — for the gap between
 * a form's submit handler returning and the row actually landing (revalidation, redirect). */
export async function waitForDbRow<T>(
  check: () => Promise<T | null>,
  { timeoutMs = 10_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastResult: T | null = null
  while (Date.now() < deadline) {
    lastResult = await check()
    if (lastResult) return lastResult
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `waitForDbRow: no matching row appeared within ${timeoutMs}ms — the form likely rendered ` +
      'success but did not actually persist (the exact bug class this suite exists to catch).'
  )
}
