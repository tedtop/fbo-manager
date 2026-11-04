import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'
import { TEST_ANON_KEY, TEST_SUPABASE_URL, createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeFlight } from '@/tests/support/factories'

// B26a: service catalog + flight_service + set_flight_services (migration 20261104000200).
const db = createTestClient()

const MIGRATION = path.resolve(__dirname, '../../supabase/migrations/20261104000200_service_catalog.sql')
const DB_URL =
  process.env.SUPABASE_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
// Local demo JWT secret shipped with every `supabase start` (not a secret); used to mint an
// `authenticated` token so the RPC/RLS path is exercised as the app's logged-in users.
const LOCAL_JWT_SECRET =
  process.env.SUPABASE_TEST_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const SEEDED_KEYS = [
  'fuel', 'hangar', 'catering', 'gpu', 'lav', 'oxygen', 'courtesy_car', 'rental_car',
  'passengers', 'coffee', 'ice', 'dishes', 'cleaning', 'maintenance', 'ground_transport',
]

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function authenticatedClient() {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      role: 'authenticated',
      aud: 'authenticated',
      sub: '00000000-0000-0000-0000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  )
  const sig = createHmac('sha256', LOCAL_JWT_SECRET).update(`${header}.${payload}`).digest('base64url')
  return createClient<Database>(TEST_SUPABASE_URL, TEST_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${header}.${payload}.${sig}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function ts(iso: string | undefined): number {
  return iso ? new Date(iso).getTime() : Number.NaN
}

function psql(args: string[], input?: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', ...args], {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { ok: true, out }
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    return { ok: false, out: `${err.stderr ?? ''}${err.message}` }
  }
}

const psqlAvailable = psql(['-c', 'select 1']).ok

// 20261104001200 renames modified_at to updated_at and drops set_modified_at(); the older migration file is
// history that fresh databases replay in order, so re-running it on top of the rename is not supported.
const modifiedAtRenamed =
  psqlAvailable &&
  psql([
    '-Atc',
    "select not exists (select 1 from pg_proc where proname = 'set_modified_at' and pronamespace = 'public'::regnamespace)",
  ]).out.trim() === 't'

async function serviceId(key: string): Promise<number> {
  const { data, error } = await db.from('service').select('id').eq('key', key).single()
  if (error) throw error
  return data.id
}

async function junctionKeys(flightId: number): Promise<string[]> {
  const { data, error } = await db
    .from('flight_service')
    .select('service:service_id(key)')
    .eq('flight_id', flightId)
  if (error) throw error
  return (data as unknown as Array<{ service: { key: string } }>).map((r) => r.service.key).sort()
}

async function legacyServices(flightId: number): Promise<string[]> {
  const { data, error } = await db.from('flight').select('services').eq('id', flightId).single()
  if (error) throw error
  return [...(data.services as unknown as string[])].sort()
}

beforeEach(async () => {
  await resetDatabase(db)
})

afterEach(async () => {
  // Tests that touch the catalog restore it here (reset.ts deliberately keeps `service`).
  await db.from('service').update({ active: true }).eq('key', 'ice')
  await db.from('service').delete().like('key', 'zz_test_%')
})

describe('service catalog seed', () => {
  it('has the 15 seeded board services with unique keys, no product link and no price column', async () => {
    const { data, error } = await db.from('service').select('*').order('sort_order')
    expect(error).toBeNull()
    expect(data).toHaveLength(15)
    expect(new Set(data?.map((s) => s.key)).size).toBe(15)
    expect(data?.map((s) => s.key)).toEqual(SEEDED_KEYS)
    expect(data?.every((s) => s.product_id === null && s.active)).toBe(true)
    expect(data?.every((s) => !('default_price' in s))).toBe(true)
    const fuel = data?.find((s) => s.key === 'fuel')
    expect(fuel).toMatchObject({ label: 'Fuel', icon: 'fuel', color: 'blue' })
  })

  it('rejects a duplicate key and a malformed key', async () => {
    const dup = await db.from('service').insert({ key: 'fuel', label: 'x', icon: 'x', color: 'x' })
    expect(dup.error?.code).toBe('23505')
    const bad = await db.from('service').insert({ key: 'Bad Key', label: 'x', icon: 'x', color: 'x' })
    expect(bad.error?.code).toBe('23514')
  })

  it('sets explicit timestamp defaults and bumps updated_at on update', async () => {
    const { data: created } = await db
      .from('service')
      .insert({ key: 'zz_test_a', label: 'A', icon: 'x', color: 'x' })
      .select()
      .single()
    expect(created?.created_at).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    const { data: updated } = await db
      .from('service')
      .update({ label: 'B' })
      .eq('id', created?.id ?? -1)
      .select()
      .single()
    expect(ts(updated?.updated_at)).toBeGreaterThan(ts(created?.updated_at))
  })
})

describe('flight_service constraints', () => {
  it('enforces UNIQUE(flight_id, service_id) and quantity > 0', async () => {
    const flight = await makeFlight(db)
    const sid = await serviceId('fuel')
    const first = await db.from('flight_service').insert({ flight_id: flight.id, service_id: sid })
    expect(first.error).toBeNull()
    const dup = await db.from('flight_service').insert({ flight_id: flight.id, service_id: sid })
    expect(dup.error?.code).toBe('23505')
    const zero = await db
      .from('flight_service')
      .insert({ flight_id: flight.id, service_id: await serviceId('gpu'), quantity: 0 })
    expect(zero.error?.code).toBe('23514')
  })

  it('cascades when the flight is hard-deleted', async () => {
    const flight = await makeFlight(db)
    await db.from('flight_service').insert({ flight_id: flight.id, service_id: await serviceId('fuel') })
    const del = await db.from('flight').delete().eq('id', flight.id)
    expect(del.error).toBeNull()
    const { count } = await db
      .from('flight_service')
      .select('*', { count: 'exact', head: true })
      .eq('flight_id', flight.id)
    expect(count).toBe(0)
  })

  it('restricts deleting a service that is in use', async () => {
    const flight = await makeFlight(db)
    const sid = await serviceId('fuel')
    await db.from('flight_service').insert({ flight_id: flight.id, service_id: sid })
    const del = await db.from('service').delete().eq('id', sid)
    expect(del.error?.code).toBe('23503')
    expect(await serviceId('fuel')).toBe(sid)
  })
})

describe('set_flight_services', () => {
  it('replaces the junction rows (delete missing, keep present) and returns keys', async () => {
    const flight = await makeFlight(db)
    const first = await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: ['fuel', 'gpu', 'catering'],
    })
    expect(first.error).toBeNull()
    expect(first.data).toEqual(['fuel', 'catering', 'gpu']) // seed sort order
    expect(await junctionKeys(flight.id)).toEqual(['catering', 'fuel', 'gpu'])

    const second = await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: ['gpu', 'lav'],
    })
    expect(second.data).toEqual(['gpu', 'lav'])
    expect(await junctionKeys(flight.id)).toEqual(['gpu', 'lav'])

    const cleared = await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: [] })
    expect(cleared.data).toEqual([])
    expect(await junctionKeys(flight.id)).toEqual([])
  })

  it('accepts objects with quantity/notes/price_override and keeps them when only the key is resent', async () => {
    const flight = await makeFlight(db)
    await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: [{ key: 'gpu', quantity: 2, notes: 'two starts', price_override: 80.5 }, 'fuel'],
    })
    const read = async () => {
      const { data } = await db
        .from('flight_service')
        .select('quantity, notes, price_override')
        .eq('flight_id', flight.id)
        .eq('service_id', await serviceId('gpu'))
        .single()
      return data
    }
    expect(await read()).toEqual({ quantity: 2, notes: 'two starts', price_override: 80.5 })

    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['gpu', 'fuel'] })
    expect(await read()).toEqual({ quantity: 2, notes: 'two starts', price_override: 80.5 })

    await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: [{ key: 'gpu', quantity: 3, price_override: null }, 'fuel'],
    })
    expect(await read()).toEqual({ quantity: 3, notes: 'two starts', price_override: null })
  })

  it('raises on an unknown key and leaves the flight untouched', async () => {
    const flight = await makeFlight(db)
    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['fuel'] })
    const res = await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: ['gpu', 'no_such_service'],
    })
    expect(res.error?.message).toContain('unknown service key(s): no_such_service')
    expect(await junctionKeys(flight.id)).toEqual(['fuel'])
    expect(await legacyServices(flight.id)).toEqual(['fuel'])
  })

  it('raises on any inactive key, even one the flight already has', async () => {
    const flight = await makeFlight(db)
    await db.from('service').update({ active: false }).eq('key', 'ice')
    const res = await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['ice'] })
    expect(res.error?.message).toContain('inactive service key(s): ice')
    expect(await junctionKeys(flight.id)).toEqual([])

    // No exception for a key the flight already holds: retired services do not stay on flights.
    await db.from('service').update({ active: true }).eq('key', 'ice')
    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['ice'] })
    await db.from('service').update({ active: false }).eq('key', 'ice')
    const keep = await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: ['ice', 'fuel'],
    })
    expect(keep.error?.message).toContain('inactive service key(s): ice')
    expect(await junctionKeys(flight.id)).toEqual(['ice'])
    const drop = await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['fuel'] })
    expect(drop.error).toBeNull()
    expect(await junctionKeys(flight.id)).toEqual(['fuel'])
  })

  it('raises for a missing flight and for malformed input', async () => {
    const missing = await db.rpc('set_flight_services', { p_flight_id: 987654321, p_services: ['fuel'] })
    expect(missing.error?.message).toContain('not found')
    const flight = await makeFlight(db)
    const bad = await db.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: [{ quantity: 1 }] as never,
    })
    expect(bad.error?.message).toContain('string "key"')
  })

  it('bumps flight.updated_at and keeps flight.services in sync as an array of keys', async () => {
    const flight = await makeFlight(db)
    const { data: before } = await db.from('flight').select('updated_at').eq('id', flight.id).single()
    await new Promise((r) => setTimeout(r, 20))
    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['lav', 'fuel'] })
    const { data: after } = await db.from('flight').select('updated_at').eq('id', flight.id).single()
    expect(ts(after?.updated_at)).toBeGreaterThan(ts(before?.updated_at))
    expect(await legacyServices(flight.id)).toEqual(['fuel', 'lav'])

    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['gpu'] })
    expect(await legacyServices(flight.id)).toEqual(['gpu'])
    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: [] })
    expect(await legacyServices(flight.id)).toEqual([])
  })

  it('embeds through PostgREST (service keys per flight)', async () => {
    const flight = await makeFlight(db)
    await db.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['fuel', 'cleaning'] })
    const { data, error } = await db
      .from('flight')
      .select('id, flight_service(quantity, service:service_id(key, label))')
      .eq('id', flight.id)
      .single()
    expect(error).toBeNull()
    const rows = (data as unknown as { flight_service: Array<{ service: { key: string } }> }).flight_service
    expect(rows.map((r) => r.service.key).sort()).toEqual(['cleaning', 'fuel'])
  })
})

describe('access control', () => {
  it('denies anon on both tables and on the RPC', async () => {
    const anon = createClient<Database>(TEST_SUPABASE_URL, TEST_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    for (const table of ['service', 'flight_service'] as const) {
      const res = await anon.from(table).select('id').limit(1)
      expect(res.error, `${table} must reject anon`).not.toBeNull()
      expect(res.data ?? []).toHaveLength(0)
    }
    const flight = await makeFlight(db)
    const rpc = await anon.rpc('set_flight_services', { p_flight_id: flight.id, p_services: ['fuel'] })
    expect(rpc.error).not.toBeNull()
    expect(await junctionKeys(flight.id)).toEqual([])
  })

  it('lets an authenticated user read the catalog, write junction rows and call the RPC', async () => {
    const authed = authenticatedClient()
    const cat = await authed.from('service').select('key')
    expect(cat.error).toBeNull()
    expect(cat.data).toHaveLength(15)

    const flight = await makeFlight(db)
    const rpc = await authed.rpc('set_flight_services', {
      p_flight_id: flight.id,
      p_services: ['fuel', 'oxygen'],
    })
    expect(rpc.error).toBeNull()
    expect(rpc.data).toEqual(['fuel', 'oxygen'])

    const ins = await authed
      .from('flight_service')
      .insert({ flight_id: flight.id, service_id: await serviceId('gpu') })
    expect(ins.error).toBeNull()
    const del = await authed.from('flight_service').delete().eq('flight_id', flight.id)
    expect(del.error).toBeNull()
  })
})

describe.skipIf(!psqlAvailable)('migration file (direct SQL against the local database)', () => {
  it.skipIf(modifiedAtRenamed)('is idempotent: running the whole file again succeeds and changes nothing', async () => {
    const before = await db.from('service').select('*').order('id')
    const run = psql(['-f', MIGRATION])
    expect(run.ok, run.out).toBe(true)
    const again = psql(['-f', MIGRATION])
    expect(again.ok, again.out).toBe(true)
    const after = await db.from('service').select('*').order('id')
    expect(after.data).toEqual(before.data)
  })

  function backfillBlock(): string {
    const sql = readFileSync(MIGRATION, 'utf8')
    const m = sql.match(/-- BACKFILL:BEGIN\n([\s\S]*?)-- BACKFILL:END/)
    if (!m) throw new Error('backfill markers not found in migration')
    return m[1]
  }

  // Scratch rows live only inside a transaction that is always rolled back.
  function scratch(servicesLiteral: string, expectSql: string) {
    return `begin;
      insert into users (id, username, email, password, role) values (990001, 'zz-scratch', 'zz@example.test', 'x', 'admin') on conflict do nothing;
      insert into aircraft (tail_number) values ('ZZSCRATCH1');
      insert into flight (tail_number, scheduled_departure_time, created_by_id, services)
        values ('ZZSCRATCH1', now(), 990001, ${servicesLiteral});
      ${backfillBlock()}
      ${expectSql}
      rollback;`
  }

  it('backfill maps lavatory->lav, transport->ground_transport, cleaning->cleaning and collapses duplicates', async () => {
    const dtype = psql(['-At', '-c', "select data_type from information_schema.columns where table_name='flight' and column_name='services'"]).out.trim()
    const lit = dtype === 'jsonb'
      ? `'["lavatory","lav","transport","cleaning","fuel"]'::jsonb`
      : `array['lavatory','lav','transport','cleaning','fuel']`
    const res = psql(
      ['-At'],
      scratch(
        lit,
        `select string_agg(s.key, ',' order by s.key) from flight_service fs join service s on s.id = fs.service_id
           join flight f on f.id = fs.flight_id where f.tail_number = 'ZZSCRATCH1';`
      )
    )
    expect(res.ok, res.out).toBe(true)
    expect(res.out).toContain('cleaning,fuel,ground_transport,lav')
    // lav + lavatory collapsed to one row: 4 junction rows from 5 legacy keys
    const rows = res.out.split('\n').find((l) => l.startsWith('cleaning,')) ?? ''
    expect(rows.split(',')).toHaveLength(4)
    // nothing left behind
    const left = await db.from('aircraft').select('tail_number').eq('tail_number', 'ZZSCRATCH1')
    expect(left.data).toHaveLength(0)
  })

  it('backfill raises on an unknown legacy key, listing it, and writes nothing', async () => {
    const dtype = psql(['-At', '-c', "select data_type from information_schema.columns where table_name='flight' and column_name='services'"]).out.trim()
    const lit = dtype === 'jsonb'
      ? `'["cleaning","mystery_item","other_mystery"]'::jsonb`
      : `array['cleaning','mystery_item','other_mystery']`
    const res = psql(['-At'], scratch(lit, 'select 1;'))
    expect(res.ok).toBe(false)
    expect(res.out).toContain('flight.services has keys with no catalog row: mystery_item, other_mystery')
    const { count } = await db.from('flight_service').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})
