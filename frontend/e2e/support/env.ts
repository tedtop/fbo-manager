// Shared constants for the E2E layer: local Supabase stack connection info + the two
// "Quick Dev Login" seed accounts the login form already wires up
// (components/forms/login-form.tsx). These are the same standard Supabase CLI local-dev
// demo keys used by frontend/tests/support/client.ts for the repository test suite — not
// secrets, baked into every local Supabase CLI project's default JWT signing config.

export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? LOCAL_SUPABASE_URL
export const E2E_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY
export const E2E_SUPABASE_SERVICE_ROLE_KEY =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY

// Next.js 16 dev server blocks cross-origin requests to _next/* dev resources from
// anything but "localhost" by default (allowedDevOrigins) — 127.0.0.1 gets blocked even
// though it's loopback, so this deliberately differs from the repo test suite's
// 127.0.0.1-only convention.
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

/**
 * Same safety principle as tests/support/client.ts's assertSafeTestTarget: the E2E seed
 * script creates real auth users (and, via the app under test, real DB rows) against
 * whatever this points at. Only loopback is allowed by default.
 */
export function assertSafeE2ETarget(url: string): void {
  const host = new URL(url).hostname
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (loopback) return
  if (process.env.E2E_ALLOW_REMOTE !== 'yes-i-am-sure') {
    throw new Error(
      `Refusing to run E2E setup against "${url}" — this seeds real auth users and drives ` +
        'the real app against it. Only safe against the local Supabase stack (127.0.0.1). ' +
        'Set E2E_SUPABASE_URL and E2E_ALLOW_REMOTE=yes-i-am-sure to override deliberately.'
    )
  }
}

export const DEV_USERS = {
  admin: { email: 'admin@fbo.local', password: 'devadmin', role: 'Administrator' as const },
  user: { email: 'user@fbo.local', password: 'devuser', role: 'Line Technician' as const },
}
