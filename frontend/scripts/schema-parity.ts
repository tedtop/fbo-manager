/**
 * Schema parity check (B36): compares the LIVE linked Supabase project against the
 * LOCAL stack for this app's tables. READ-ONLY on live (`--read-only`, never `--yes`).
 *
 *   pnpm schema:parity
 *
 * Local target is the CLI default (127.0.0.1:54322); override with
 * SCHEMA_PARITY_LOCAL_DB_URL (percent-encoded postgres URL) if the DB port differs.
 * Exits 1 on any drift not covered by scripts/schema-parity.allow.json.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  applyAllowList,
  compareSchemas,
  type SchemaSnapshot,
  validateAllowList
} from './schema-parity-core'

// Tables this app uses (types/database.ts). Deliberately excluded:
//  - Minuteman-owned tables (docs/rls-rollout-plan.md groups A and A', incl. tank_level_readings)
//  - fuel_tank_readings (owned by a separate external app; never touched, not even selected)
const SCOPE = [
  'users',
  'aircraft',
  'fuel_tank',
  'parking_location',
  'flight',
  'fueler',
  'training',
  'fueler_training',
  'fueler_training_history',
  'assigned_training',
  'training_course',
  'training_completion',
  'fuel_transaction',
  'fueler_assignment',
  'equipment',
  'department',
  'department_member',
  'schedule_shift',
  'time_card_scan',
  'customer',
  'product',
  'invoice',
  'invoice_item',
  'truck_sheets',
  'truck_meter_readings',
  'profiles',
  'roles',
  'module_permissions',
  'user_roles',
  'invoices',
  'invoice_line_items',
  'invoice_fuel_readings',
  'scanned_documents',
  'app_error_log'
]

const list = SCOPE.map((t) => `'${t}'`).join(',')
const SQL = `select json_build_object(
  'tables', (select coalesce(json_agg(table_name order by table_name), '[]'::json)
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name in (${list})),
  'columns', (select coalesce(json_agg(json_build_object(
      'table', table_name, 'column', column_name, 'dataType', data_type,
      'isNullable', is_nullable = 'YES', 'columnDefault', coalesce(column_default, case when is_identity = 'YES' then 'identity' end))
      order by table_name, column_name), '[]'::json)
    from information_schema.columns
    where table_schema = 'public' and table_name in (${list})),
  'constraints', (select coalesce(json_agg(json_build_object(
      'table', c.relname, 'name', k.conname,
      'kind', case k.contype when 'c' then 'check' else 'foreign_key' end,
      'definition', pg_get_constraintdef(k.oid))
      order by c.relname, k.conname), '[]'::json)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and k.contype in ('c', 'f') and c.relname in (${list}))
) as snapshot`

// The project-local node_modules/.bin/supabase is an older CLI (2.x) without
// `--read-only`; \`pnpm\` puts it first on PATH. Use the globally installed CLI instead.
const CLI_ENV = {
  ...process.env,
  PATH: (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter((p) => !p.includes('node_modules'))
    .join(path.delimiter)
}

function assertReadOnlyCli() {
  const help = execFileSync('supabase', ['db', 'query', '--help'], {
    encoding: 'utf8',
    env: CLI_ENV,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (!help.includes('--read-only') || !help.includes('--remote')) {
    throw new Error(
      'The supabase CLI on PATH lacks `db query --remote --read-only` (need CLI 3.x). ' +
        'Refusing to query the live project without a read-only guarantee.'
    )
  }
}

function fetchSnapshot(target: 'live' | 'local'): SchemaSnapshot {
  const args = ['db', 'query', '--output-format', 'json', '--read-only']
  if (target === 'live') args.push('--remote')
  else if (process.env.SCHEMA_PARITY_LOCAL_DB_URL) {
    args.push('--db-url', process.env.SCHEMA_PARITY_LOCAL_DB_URL)
  }
  args.push(SQL)
  const out = execFileSync('supabase', args, {
    encoding: 'utf8',
    env: CLI_ENV,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const parsed = JSON.parse(out.slice(out.indexOf('{')))
  const snap = parsed.rows?.[0]?.snapshot
  return typeof snap === 'string' ? JSON.parse(snap) : snap
}

function main() {
  const allowPath = path.join(__dirname, 'schema-parity.allow.json')
  const allow = validateAllowList(JSON.parse(readFileSync(allowPath, 'utf8')))

  assertReadOnlyCli()
  const live = fetchSnapshot('live')
  const local = fetchSnapshot('local')
  const diffs = compareSchemas(live, local, SCOPE)
  const { allowed, unexplained, stale } = applyAllowList(diffs, allow)

  console.log(
    `Compared ${SCOPE.length} tables: live has ${live.tables.length}, local has ${local.tables.length}.`
  )
  if (allowed.length) {
    console.log(`\nAllowed differences (${allowed.length}):`)
    for (const d of allowed)
      console.log(`  ~ ${d.message}\n      reason: ${d.reason}`)
  }
  if (stale.length) {
    console.log('\nStale allow-list entries (no longer drifting, remove them):')
    for (const s of stale) console.log(`  ? ${s.key}`)
  }
  if (unexplained.length) {
    console.log(`\nDRIFT (${unexplained.length}):`)
    for (const d of unexplained)
      console.log(`  ! ${d.message}\n      key: ${d.key}`)
    process.exit(1)
  }
  if (stale.length) process.exit(1)
  console.log('\nNo unexplained drift.')
}

main()
