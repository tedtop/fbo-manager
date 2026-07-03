import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // All repository integration tests share one local Supabase/Postgres instance and
    // reset the full table set in `beforeEach`. Running test files concurrently would let
    // one file's reset wipe rows another file is mid-assertion on, so keep files sequential.
    fileParallelism: false,
    setupFiles: ['./tests/support/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
