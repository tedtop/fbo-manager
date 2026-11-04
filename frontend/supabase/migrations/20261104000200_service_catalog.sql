-- B26a: service catalog + flight_service junction + set_flight_services RPC (D10).
--
-- `service` is the BOARD vocabulary only (key, label, icon, color, order). Billing lives in
-- `product`; a service may point at one via the nullable product_id (left NULL here until Ted
-- maps them). There is deliberately NO default_price column (docs/PLAN.md, B26 addendum).
-- `flight_service` records which services a flight has (quantity, notes, price_override).
--
-- Touches: service (new), flight_service (new). Reads flight, product. Writes flight.services
-- and flight.modified_at only through set_flight_services(). Never touches fuel_tank_readings.
--
-- Live vs local differ on flight.services (live: jsonb, nullable; local test schema: text[]) and
-- on flight.id / product.id (live bigint, local integer). Everything below is written to work on
-- both: junction FKs are bigint (a bigint column may reference an integer key), and the legacy
-- column is only touched through to_jsonb() / jsonb_populate_record(), which adapt to its type.
--
-- Idempotent: safe to run twice (create if not exists, ON CONFLICT seed, drop/create for
-- triggers and policies, create or replace for the function).
--
-- Apply to live ONLY with: supabase db query --linked --yes -f <this file>  (never `db push`),
-- after a read-only backup of flight(id, services), then:
--   supabase migration repair --linked --yes --status applied 20261104000200
-- Rollback: supabase/rollbacks/20261104000200_service_catalog.down.sql

begin;

-- ============================================================
-- 1. Tables
-- ============================================================
create table if not exists service (
  id          bigint generated always as identity primary key,
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label       text not null,
  icon        text not null,      -- lucide icon name (kebab-case), resolved client-side
  color       text not null,      -- semantic colour token (e.g. 'blue'), NOT a tailwind class string
  sort_order  integer not null default 0,
  active      boolean not null default true,
  product_id  bigint references product(id) on delete set null,
  created_at  timestamptz not null default now(),
  modified_at timestamptz not null default now()
);
create index if not exists service_active_sort_idx on service (active, sort_order);
create index if not exists service_product_id_idx on service (product_id) where product_id is not null;

create table if not exists flight_service (
  id             bigint generated always as identity primary key,
  flight_id      bigint not null references flight(id) on delete cascade,
  service_id     bigint not null references service(id) on delete restrict,
  quantity       integer not null default 1 check (quantity > 0),
  notes          text not null default '',
  price_override numeric(10,2) check (price_override is null or price_override >= 0),
  created_at     timestamptz not null default now(),
  modified_at    timestamptz not null default now(),
  unique (flight_id, service_id)
);
create index if not exists flight_service_flight_id_idx  on flight_service (flight_id);
create index if not exists flight_service_service_id_idx on flight_service (service_id);

-- ============================================================
-- 2. modified_at triggers (generic function from 20260703000300)
-- ============================================================
drop trigger if exists trg_service_set_modified_at on service;
create trigger trg_service_set_modified_at
  before update on service
  for each row execute function set_modified_at();

drop trigger if exists trg_flight_service_set_modified_at on flight_service;
create trigger trg_flight_service_set_modified_at
  before update on flight_service
  for each row execute function set_modified_at();

-- ============================================================
-- 3. Seed: the 12 card pills (same order, labels, icons and colours as the hard-coded
--    serviceConfig in flight-card.tsx) + cleaning, maintenance, ground_transport.
--    ON CONFLICT DO NOTHING so later edits to the catalog survive a re-run.
-- ============================================================
insert into service (key, label, icon, color, sort_order) values
  ('fuel',             'Fuel',             'fuel',             'blue',    10),
  ('hangar',           'Hangar',           'warehouse',        'violet',  20),
  ('catering',         'Catering',         'utensils-crossed', 'green',   30),
  ('gpu',              'GPU',              'zap',              'yellow',  40),
  ('lav',              'Lav',              'droplet',          'cyan',    50),
  ('oxygen',           'Oxygen',           'wind',             'purple',  60),
  ('courtesy_car',     'Courtesy Car',     'car',              'orange',  70),
  ('rental_car',       'Rental Car',       'car',              'rose',    80),
  ('passengers',       'Passengers',       'users',            'indigo',  90),
  ('coffee',           'Coffee',           'coffee',           'amber',  100),
  ('ice',              'Ice',              'snowflake',        'sky',    110),
  ('dishes',           'Dishes',           'utensils-crossed', 'teal',   120),
  ('cleaning',         'Cleaning',         'sparkles',         'emerald',130),
  ('maintenance',      'Maintenance',      'wrench',           'slate',  140),
  ('ground_transport', 'Ground Transport', 'bus',              'pink',   150)
on conflict (key) do nothing;

-- ============================================================
-- 4. RLS + grants (docs/rls-rollout-plan.md): anon denied, authenticated may read and write.
--    service_role bypasses RLS. Write access on `service` is tightened to the module-access
--    helper later (B30).
-- ============================================================
alter table service        enable row level security;
alter table flight_service enable row level security;

revoke all on service        from anon;
revoke all on flight_service from anon;
grant select, insert, update, delete on service        to authenticated;
grant select, insert, update, delete on flight_service to authenticated;
grant all on service        to service_role;
grant all on flight_service to service_role;
grant usage, select on sequence service_id_seq        to authenticated, service_role;
grant usage, select on sequence flight_service_id_seq to authenticated, service_role;

drop policy if exists "service_select_authenticated" on service;
drop policy if exists "service_insert_authenticated" on service;
drop policy if exists "service_update_authenticated" on service;
drop policy if exists "service_delete_authenticated" on service;
create policy "service_select_authenticated" on service for select to authenticated using (true);
create policy "service_insert_authenticated" on service for insert to authenticated with check (true);
create policy "service_update_authenticated" on service for update to authenticated using (true) with check (true);
create policy "service_delete_authenticated" on service for delete to authenticated using (true);

drop policy if exists "flight_service_select_authenticated" on flight_service;
drop policy if exists "flight_service_insert_authenticated" on flight_service;
drop policy if exists "flight_service_update_authenticated" on flight_service;
drop policy if exists "flight_service_delete_authenticated" on flight_service;
create policy "flight_service_select_authenticated" on flight_service for select to authenticated using (true);
create policy "flight_service_insert_authenticated" on flight_service for insert to authenticated with check (true);
create policy "flight_service_update_authenticated" on flight_service for update to authenticated using (true) with check (true);
create policy "flight_service_delete_authenticated" on flight_service for delete to authenticated using (true);

-- ============================================================
-- 5. RPC: set_flight_services(p_flight_id, p_services)
--    p_services: jsonb array of plain key strings and/or objects
--    {key, quantity?, notes?, price_override?}. Replaces the flight's junction rows atomically:
--    rows not listed are deleted, listed rows are inserted or (for the fields given) updated;
--    a plain key string leaves an existing row's quantity/notes/price_override untouched.
--    SECURITY INVOKER so RLS applies. Bumps flight.modified_at (the edit-concurrency check
--    reads it) and dual-writes flight.services as an array of keys until B26e drops it.
--    Unknown keys and inactive keys both raise (no exception for keys the flight already has;
--    Ted, 2026-11-04: retired services need not stay on flights). Returns the resulting keys (sort order).
-- ============================================================
create or replace function set_flight_services(p_flight_id bigint, p_services jsonb)
returns text[]
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_elem     jsonb;
  v_key      text;
  v_map      jsonb := '{}'::jsonb;   -- key -> normalised object; duplicate keys: last one wins
  v_bad      text;
  v_keys     text[];
begin
  if p_services is null or jsonb_typeof(p_services) <> 'array' then
    raise exception 'p_services must be a jsonb array' using errcode = '22023';
  end if;

  perform 1 from flight where id = p_flight_id for update;
  if not found then
    raise exception 'flight % not found', p_flight_id using errcode = 'P0002';
  end if;

  for v_elem in select value from jsonb_array_elements(p_services) loop
    if jsonb_typeof(v_elem) = 'string' then
      v_key := v_elem #>> '{}';
      v_elem := jsonb_build_object('key', v_key);
    elsif jsonb_typeof(v_elem) = 'object' and jsonb_typeof(v_elem -> 'key') = 'string' then
      v_key := v_elem ->> 'key';
    else
      raise exception 'each service must be a key string or an object with a string "key"' using errcode = '22023';
    end if;
    v_map := v_map || jsonb_build_object(v_key, v_elem);
  end loop;

  select string_agg(j.key, ', ' order by j.key) into v_bad
  from jsonb_each(v_map) j
  left join service s on s.key = j.key
  where s.id is null;
  if v_bad is not null then
    raise exception 'unknown service key(s): %', v_bad using errcode = '22023';
  end if;

  select string_agg(s.key, ', ' order by s.key) into v_bad
  from jsonb_each(v_map) j
  join service s on s.key = j.key
  where not s.active;
  if v_bad is not null then
    raise exception 'inactive service key(s): %', v_bad using errcode = '22023';
  end if;

  delete from flight_service fs
  where fs.flight_id = p_flight_id
    and fs.service_id not in (select s.id from jsonb_each(v_map) j join service s on s.key = j.key);

  insert into flight_service (flight_id, service_id, quantity, notes, price_override)
  select p_flight_id, s.id,
         coalesce((j.value ->> 'quantity')::integer, 1),
         coalesce(j.value ->> 'notes', ''),
         nullif(j.value ->> 'price_override', '')::numeric
  from jsonb_each(v_map) j
  join service s on s.key = j.key
  on conflict (flight_id, service_id) do nothing;

  -- Existing rows: apply only the fields the caller supplied.
  update flight_service fs
  set quantity       = coalesce((j.value ->> 'quantity')::integer, fs.quantity),
      notes          = coalesce(j.value ->> 'notes', fs.notes),
      price_override = case when j.value ? 'price_override'
                            then nullif(j.value ->> 'price_override', '')::numeric
                            else fs.price_override end
  from jsonb_each(v_map) j
  join service s on s.key = j.key
  where fs.flight_id = p_flight_id
    and fs.service_id = s.id
    and (j.value ? 'quantity' or j.value ? 'notes' or j.value ? 'price_override')
    and (fs.quantity, fs.notes, fs.price_override) is distinct from (
          coalesce((j.value ->> 'quantity')::integer, fs.quantity),
          coalesce(j.value ->> 'notes', fs.notes),
          case when j.value ? 'price_override'
               then nullif(j.value ->> 'price_override', '')::numeric
               else fs.price_override end);

  select coalesce(array_agg(s.key order by s.sort_order, s.key), '{}'::text[]) into v_keys
  from flight_service fs
  join service s on s.id = fs.service_id
  where fs.flight_id = p_flight_id;

  -- Dual-write the legacy column (jsonb live, text[] local): jsonb_populate_record coerces the
  -- key array to whatever type flight.services has. modified_at is also set by the flight trigger.
  update flight
  set services    = (jsonb_populate_record(null::flight, jsonb_build_object('services', to_jsonb(v_keys)))).services,
      modified_at = now()
  where id = p_flight_id;

  return v_keys;
end;
$fn$;

revoke all on function set_flight_services(bigint, jsonb) from public, anon;
grant execute on function set_flight_services(bigint, jsonb) to authenticated, service_role;

-- ============================================================
-- 6. Backfill flight.services -> flight_service (BACKFILL:BEGIN/END markers are used by the
--    migration test to run this block against scratch data in a rolled-back transaction).
--    lavatory -> lav, transport -> ground_transport; every other key maps to itself; unknown
--    keys RAISE (nothing is silently dropped); lav + lavatory on one flight collapse to one row.
--    A no-op on an empty flight table.
-- ============================================================
-- BACKFILL:BEGIN
do $backfill$
declare
  v_unknown  text;
  v_nonarray bigint;
  v_before   bigint;
  v_expected bigint;
  v_actual   bigint;
  v_missing  bigint;
begin
  select count(*) into v_nonarray
  from flight f
  where to_jsonb(f.services) is not null and jsonb_typeof(to_jsonb(f.services)) <> 'array';
  if v_nonarray > 0 then
    raise exception 'flight.services is not an array on % row(s)', v_nonarray;
  end if;

  drop table if exists _svc_pairs;
  create temporary table _svc_pairs on commit drop as
  select distinct f.id as flight_id, coalesce(m.mapped, e.k) as key
  from flight f
  cross join lateral jsonb_array_elements_text(to_jsonb(f.services)) e(k)
  left join (values ('lavatory', 'lav'), ('transport', 'ground_transport')) m(legacy, mapped)
         on m.legacy = e.k
  where jsonb_typeof(to_jsonb(f.services)) = 'array';

  select string_agg(distinct p.key, ', ' order by p.key) into v_unknown
  from _svc_pairs p
  left join service s on s.key = p.key
  where s.id is null;
  if v_unknown is not null then
    raise exception 'flight.services has keys with no catalog row: %', v_unknown;
  end if;

  select count(*) into v_before from flight_service;

  insert into flight_service (flight_id, service_id)
  select p.flight_id, s.id
  from _svc_pairs p
  join service s on s.key = p.key
  on conflict (flight_id, service_id) do nothing;

  select count(*) into v_expected from _svc_pairs;
  select count(*) into v_actual from flight_service;
  select count(*) into v_missing
  from _svc_pairs p
  join service s on s.key = p.key
  where not exists (select 1 from flight_service fs
                    where fs.flight_id = p.flight_id and fs.service_id = s.id);

  -- First run (junction was empty): counts must match exactly. Re-run on a populated junction
  -- (rows added by the app since): every expected pair must exist.
  if v_missing <> 0 or (v_before = 0 and v_actual <> v_expected) then
    raise exception 'flight_service backfill mismatch: expected % distinct (flight, key) pairs, junction has %, missing %',
      v_expected, v_actual, v_missing;
  end if;
  raise notice 'flight_service backfill: % distinct (flight, key) pairs, junction rows now %', v_expected, v_actual;
end
$backfill$;
-- BACKFILL:END

commit;
