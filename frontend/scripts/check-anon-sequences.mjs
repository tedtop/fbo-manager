#!/usr/bin/env node
// Read-only check (B94): the logged-out `anon` role must have no privilege on any public sequence
// or table. Needs a direct SQL path, which REST does not offer, so it shells out to psql.
// Targets the LOCAL stack only (default postgres://postgres:postgres@127.0.0.1:54322/postgres).
// Usage: node scripts/check-anon-sequences.mjs   (after `pnpm supabase:reset` / migrations applied)
import { execFileSync } from 'node:child_process'

const dbUrl = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl)) {
  console.error('Refusing to run against a non-local database.')
  process.exit(2)
}

const sql = `
select 'sequence ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
    and (has_sequence_privilege('anon', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'SELECT')
         or has_sequence_privilege('anon', c.oid, 'UPDATE'))
union all
select 'table ' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    and has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
order by 1`

const out = execFileSync('psql', [dbUrl, '-At', '-c', sql], { encoding: 'utf8' }).trim()
const leaks = out ? out.split('\n') : []
for (const l of leaks) console.log(`anon has privileges on ${l}`)
if (leaks.length) {
  console.log(`FAIL: ${leaks.length} public object(s) reachable by anon.`)
  process.exit(1)
}
console.log('PASS: anon has no privilege on any public sequence or table.')
