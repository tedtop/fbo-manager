import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// B121: migration 20261114000100 turns every flight_service 'fuel' row into a requested flight_card order, retires
// the service, and raises when the counts differ. Runs the file's body in a transaction that is always rolled back.
const MIGRATION = path.resolve(__dirname, '../../supabase/migrations/20261114000100_fuel_card_orders.sql')
const DB_URL =
  process.env.SUPABASE_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(input: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync('psql', [DB_URL, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return { ok: true, out }
  } catch (e) {
    const err = e as { stderr?: string; message: string }
    return { ok: false, out: `${err.stderr ?? ''}${err.message}` }
  }
}

const psqlAvailable = psql('select 1').ok

const body = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .filter((l) => !/^(begin|commit);$/.test(l.trim()))
  .join('\n')

// Two flights with a fuel service row (one with a row note, one with only a flight fuel_order_notes), one without.
const seed = `
  insert into users (id, username, password, first_name, last_name, role)
    values (990002, 'zz-b121', 'x', 'a', 'b', 'admin') on conflict do nothing;
  insert into aircraft (tail_number, aircraft_type_icao, aircraft_type_display)
    values ('ZZB121A', 'B738', 'x'), ('ZZB121B', 'B738', 'x'), ('ZZB121C', 'B738', 'x');
  insert into flight (created_by_id, tail_number, origin, destination, scheduled_departure_time, fuel_order_notes)
    values (990002, 'ZZB121A', 'KAAA', 'KBBB', now(), ''),
           (990002, 'ZZB121B', 'KAAA', 'KBBB', now(), 'from flight notes'),
           (990002, 'ZZB121C', 'KAAA', 'KBBB', now(), '');
  update service set active = true where key = 'fuel';
  select set_flight_services(f.id::bigint, '["fuel","lav"]'::jsonb) from flight f where f.tail_number in ('ZZB121A', 'ZZB121B');
  select set_flight_services(f.id::bigint, '["lav"]'::jsonb) from flight f where f.tail_number = 'ZZB121C';
  update flight_service set notes = 'top it off'
    where service_id = (select id from service where key = 'fuel')
      and flight_id = (select id from flight where tail_number = 'ZZB121A');
`

describe.skipIf(!psqlAvailable)('B121 migration: fuel service to flight_card orders', () => {
  it('creates one requested flight_card order per fuel row, drops the rows and retires the service', () => {
    const res = psql(`begin;
      ${seed}
      ${body}
      select 'orders:' || count(*) from fuel_transaction where tail_number like 'ZZB121%' and source = 'flight_card' and status = 'requested';
      select 'note:' || tail_number || ':' || coalesce(fuel_request, '-') from fuel_transaction where tail_number like 'ZZB121%' order by tail_number;
      select 'fuelrows:' || count(*) from flight_service fs join service s on s.id = fs.service_id where s.key = 'fuel';
      select 'legacy:' || tail_number || ':' || services::text from flight where tail_number like 'ZZB121%' order by tail_number;
      select 'active:' || active from service where key = 'fuel';
      rollback;`)
    expect(res.ok, res.out).toBe(true)
    const lines = res.out.split('\n')
    expect(lines).toContain('orders:2')
    expect(lines).toContain('note:ZZB121A:top it off')
    expect(lines).toContain('note:ZZB121B:from flight notes')
    expect(lines).toContain('fuelrows:0')
    expect(lines.filter((l) => l.startsWith('legacy:')).every((l) => !l.includes('fuel'))).toBe(true)
    expect(lines).toContain('active:false')
  })

  it('raises when the created count differs from the fuel rows found', () => {
    // An INSERT trigger that swallows one order makes created < expected.
    const res = psql(`begin;
      ${seed}
      create function zz_b121_swallow() returns trigger language plpgsql as $$ begin
        if new.source = 'flight_card' and new.tail_number = 'ZZB121B' then return null; end if; return new; end $$;
      create trigger zz_b121_swallow before insert on fuel_transaction for each row execute function zz_b121_swallow();
      ${body}
      rollback;`)
    expect(res.ok).toBe(false)
    expect(res.out).toContain('B121: created 1 flight_card orders for 2 fuel flight_service rows')
  })
})
