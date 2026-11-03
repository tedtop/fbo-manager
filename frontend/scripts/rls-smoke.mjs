#!/usr/bin/env node
// Read-only smoke test: what can the logged-out (anon) role reach through the Supabase REST API?
// Acceptance test for docs/rls-rollout-plan.md (Phase 0/1).
//
// Safe by construction: only GET requests with `limit=0` (no row data is returned, only the
// count header) plus the two read-only RPC getters, whose response bodies are discarded. It never
// writes, and never prints keys or row contents.
//
// Usage:
//   RLS_SMOKE_URL=https://<ref>.supabase.co RLS_SMOKE_ANON_KEY=<anon key> node scripts/rls-smoke.mjs
//   node scripts/rls-smoke.mjs                       # no env: targets the local stack (demo anon key)
//
// Exit code 1 if any table or function is reachable by anon (use --expect-open to invert, which is
// only meant for proving the script detects the hole before the fix is applied).
import { readFileSync } from 'node:fs'

const LOCAL_URL = 'http://127.0.0.1:54321'
// Public demo key shipped with every local `supabase start` (same as tests/support/client.ts).
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const url = (process.env.RLS_SMOKE_URL ?? LOCAL_URL).replace(/\/$/, '')
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)
const anonKey = process.env.RLS_SMOKE_ANON_KEY ?? (isLocal ? LOCAL_ANON_KEY : undefined)
if (!anonKey) {
  console.error('RLS_SMOKE_ANON_KEY is required for a non-local target.')
  process.exit(2)
}
const expectOpen = process.argv.includes('--expect-open')

// Table list comes from the committed before-snapshot so it is the same list on every target.
const snapshot = JSON.parse(
  readFileSync(new URL('../../docs/archive/rls-before-snapshot-2026-11-02.json', import.meta.url), 'utf8')
)
const tables = snapshot.tables.map((t) => t.tbl)
// Read-only RPC getters only. update_tank_level_min writes, so it is deliberately not probed.
const rpcGetters = ['get_latest_tank_readings', 'get_min_tank_readings']

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }

async function probeTable(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { ...headers, Prefer: 'count=exact' }
  })
  if (res.status === 200 || res.status === 206) {
    const total = (res.headers.get('content-range') ?? '').split('/')[1] ?? '?'
    return { name: table, state: 'READABLE', detail: `${total} rows visible` }
  }
  if (res.status === 404) return { name: table, state: 'absent', detail: 'not on this target' }
  return { name: table, state: 'denied', detail: `HTTP ${res.status}` }
}

async function probeRpc(fn) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}'
  })
  await res.arrayBuffer() // discard the body
  if (res.status === 200) return { name: `rpc:${fn}`, state: 'READABLE', detail: 'callable' }
  if (res.status === 404) return { name: `rpc:${fn}`, state: 'absent', detail: 'not on this target' }
  return { name: `rpc:${fn}`, state: 'denied', detail: `HTTP ${res.status}` }
}

const results = [...(await Promise.all(tables.map(probeTable))), ...(await Promise.all(rpcGetters.map(probeRpc)))]

const pad = (s, n) => s.padEnd(n)
for (const r of results) console.log(`${pad(r.name, 34)} ${pad(r.state, 9)} ${r.detail}`)

const open = results.filter((r) => r.state === 'READABLE')
const denied = results.filter((r) => r.state === 'denied').length
const absent = results.filter((r) => r.state === 'absent').length
console.log(`\ntarget: ${isLocal ? 'local stack' : new URL(url).host}`)
console.log(`readable by anon: ${open.length} | denied: ${denied} | absent: ${absent}`)

if (expectOpen) {
  console.log(open.length > 0 ? 'OK: the script detects the open tables (pre-fix check).' : 'UNEXPECTED: nothing readable.')
  process.exit(open.length > 0 ? 0 : 1)
}
if (open.length > 0) {
  console.log(`FAIL: anon can reach ${open.length} object(s).`)
  process.exit(1)
}
console.log('PASS: anon cannot reach any table or getter.')
