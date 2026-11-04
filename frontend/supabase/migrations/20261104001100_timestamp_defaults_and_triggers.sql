-- Database-owned created_at / modified_at / updated_at on this app's tables (Ted, 2026-11-04):
-- the DB fills them on insert (DEFAULT now()) and refreshes them on every UPDATE (BEFORE UPDATE trigger),
-- so no caller has to send them. Additive only: no column is renamed, dropped or retyped, no row deleted.
--
--   1. fuel_tank, users: created_at / modified_at get DEFAULT now() (NOT NULL alone never fills a value).
--   2. Tables that only had created_at get an updated_at column (backfilled from created_at, then
--      NOT NULL DEFAULT now()): truck_meter_readings, invoice_line_items, scanned_documents,
--      module_permissions, training_completion, invoice_item.
--   3. BEFORE UPDATE triggers where the table has the column but nothing maintains it:
--        modified_at / set_modified_at: aircraft, customer, department, department_member, equipment,
--          fueler, fueler_training, invoice, parking_location, product, schedule_shift, training, users
--        updated_at / set_updated_at: invoices, training_course, truck_sheets + the six tables of step 2
--
-- Deliberately NOT touched: the Minuteman-owned tables (tank_level_readings and its _backup/_django copies,
-- tank_level_min, fuel_density_readings, fuel_gravity_readings, fuel_dispatch_history, qt_session,
-- adsb_point_cache) and append-only logs (app_error_log, fueler_training_history, invoice_fuel_readings).
-- Minuteman's code only writes qt_session.updated_at itself and never reads modified_at/updated_at.
--
-- The existing modified_at / updated_at split is kept here because the app uses modified_at for its
-- compare-and-swap edit guard; unifying the name is a separate, coordinated change.
--
-- Safe to re-run. Rollback: frontend/supabase/rollbacks/20261104001100_timestamp_defaults_and_triggers.down.sql
-- Apply to live ONLY with: supabase db query --linked --yes -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --yes --status applied 20261104001100

begin;

do $$
declare
  t text;
  c text;
  has_created boolean;
begin
  -- 1. defaults on the two Django-era tables that had NOT NULL with no default
  foreach t in array array['fuel_tank', 'users'] loop
    foreach c in array array['created_at', 'modified_at'] loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = c
      ) then
        execute format('alter table public.%I alter column %I set default now()', t, c);
      end if;
    end loop;
  end loop;

  -- 2. updated_at on the tables that only had created_at
  foreach t in array array[
    'truck_meter_readings', 'invoice_line_items', 'scanned_documents',
    'module_permissions', 'training_completion', 'invoice_item'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      continue;
    end if;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'created_at'
    ) into has_created;
    execute format('alter table public.%I add column updated_at timestamptz', t);
    if has_created then
      execute format('update public.%I set updated_at = created_at', t);
    end if;
    execute format('update public.%I set updated_at = now() where updated_at is null', t);
    execute format(
      'alter table public.%I alter column updated_at set default now(), alter column updated_at set not null',
      t
    );
  end loop;
end $$;

-- 3. BEFORE UPDATE triggers (skipped when the table already has one running the same function)
do $$
declare
  specs text[][] := array[
    array['aircraft', 'modified_at', 'set_modified_at'],
    array['customer', 'modified_at', 'set_modified_at'],
    array['department', 'modified_at', 'set_modified_at'],
    array['department_member', 'modified_at', 'set_modified_at'],
    array['equipment', 'modified_at', 'set_modified_at'],
    array['fueler', 'modified_at', 'set_modified_at'],
    array['fueler_training', 'modified_at', 'set_modified_at'],
    array['invoice', 'modified_at', 'set_modified_at'],
    array['parking_location', 'modified_at', 'set_modified_at'],
    array['product', 'modified_at', 'set_modified_at'],
    array['schedule_shift', 'modified_at', 'set_modified_at'],
    array['training', 'modified_at', 'set_modified_at'],
    array['users', 'modified_at', 'set_modified_at'],
    array['invoices', 'updated_at', 'set_updated_at'],
    array['training_course', 'updated_at', 'set_updated_at'],
    array['truck_sheets', 'updated_at', 'set_updated_at'],
    array['truck_meter_readings', 'updated_at', 'set_updated_at'],
    array['invoice_line_items', 'updated_at', 'set_updated_at'],
    array['scanned_documents', 'updated_at', 'set_updated_at'],
    array['module_permissions', 'updated_at', 'set_updated_at'],
    array['training_completion', 'updated_at', 'set_updated_at'],
    array['invoice_item', 'updated_at', 'set_updated_at']
  ];
  i int;
begin
  for i in 1 .. array_length(specs, 1) loop
    if to_regclass('public.' || specs[i][1]) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = specs[i][1] and column_name = specs[i][2]
    ) then
      continue;
    end if;
    if exists (
      select 1
      from pg_trigger tg
      join pg_proc p on p.oid = tg.tgfoid
      where tg.tgrelid = to_regclass('public.' || specs[i][1])
        and not tg.tgisinternal
        and p.proname = specs[i][3]
    ) then
      continue;
    end if;
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.%I()',
      'trg_' || specs[i][1] || '_' || specs[i][3],
      specs[i][1],
      specs[i][3]
    );
  end loop;
end $$;

commit;
