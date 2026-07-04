import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { ADMIN_STORAGE_STATE, USER_STORAGE_STATE } from './e2e/global-setup'
import {
  E2E_BASE_URL,
  E2E_SUPABASE_ANON_KEY,
  E2E_SUPABASE_URL
} from './e2e/support/env'

/**
 * Full-stack E2E layer: drives the real Next.js app in a real browser against the same
 * local Supabase stack the repository integration tests use (see tests/README.md), through
 * a real login (Supabase Auth, real cookies) — not mocked fetches, not a stubbed session.
 *
 * This exists specifically to catch the bug class repository-layer tests structurally
 * cannot: a form that renders correctly and *looks* like it saved, but never actually calls
 * the repository/persistence path, or swallows the error silently. See frontend/e2e/README.md.
 *
 * Prerequisite: `pnpm supabase:start` (same local stack as the vitest repo tests).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false, // forms create real rows against one shared local DB; keep runs predictable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: require.resolve('./e2e/global-setup'),
  timeout: 30_000,

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      testIgnore: '**/user-role/**'
    },
    {
      name: 'line-technician',
      use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
      testMatch: '**/user-role/**'
    }
  ],

  webServer: {
    command: `pnpm exec next dev -p ${new URL(E2E_BASE_URL).port}`,
    url: E2E_BASE_URL,
    // Always start a fresh server bound to the local test stack rather than reusing
    // whatever might already be running on this port — reusing an existing dev server
    // could mean silently running these tests (which create real records) against
    // whatever backend *that* server happens to be configured for, live project included.
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: path.resolve(__dirname),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
      SUPABASE_URL: E2E_SUPABASE_URL,
      SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
      NEXT_TELEMETRY_DISABLED: '1'
    }
  }
})
