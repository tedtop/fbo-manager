// Single entry for the Cypress suite: starts its own `next dev` on the Cypress port bound to the
// local Supabase stack, waits for it, runs `cypress run` headless, and always stops the server it
// started. Extra args are forwarded to `cypress run` (e.g. `pnpm test:cypress --spec <glob>`).
import { type ChildProcess, spawn } from 'node:child_process'
import { E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_URL, assertSafeE2ETarget } from '../e2e/support/env'

const baseUrl = process.env.CYPRESS_BASE_URL ?? 'http://localhost:4210'
const port = new URL(baseUrl).port
assertSafeE2ETarget(E2E_SUPABASE_URL)

const server: ChildProcess = spawn('pnpm', ['exec', 'next', 'dev', '-p', port], {
  stdio: 'inherit',
  detached: true, // own process group so the whole next dev tree can be stopped
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
    SUPABASE_URL: E2E_SUPABASE_URL,
    SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
    NEXT_TELEMETRY_DISABLED: '1',
  },
})

let serverExited = false
server.on('exit', () => {
  serverExited = true
})

function stopServer() {
  if (serverExited || !server.pid) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (serverExited) throw new Error('next dev exited before becoming ready (port in use?)')
    try {
      const res = await fetch(`${baseUrl}/login`)
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`next dev not ready at ${baseUrl} after ${timeoutMs / 1000}s`)
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopServer()
    process.exit(130)
  })
}

async function main(): Promise<number> {
  await waitForServer()
  const cypress = spawn('pnpm', ['exec', 'cypress', 'run', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, CYPRESS_BASE_URL: baseUrl },
  })
  return new Promise((resolve) => {
    cypress.on('exit', (code) => resolve(code ?? 1))
  })
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    return 1
  })
  .then((code) => {
    stopServer()
    process.exit(code)
  })
