-- LOCAL/TEST PARITY (B46): make the local test schema match live where `pnpm schema:parity` found drift.
-- A no-op on live: the columns below do not exist there, the defaults and NOT NULL already hold.
-- Do not record this version on live (nothing to apply); it exists so a local `supabase db reset` ends up like live.

-- 1. assigned_fueler_id / available_at: a copy-paste artifact in 20260703000000_test_schema.sql, present on 9
--    tables locally, on none of them live, and not read or written by the app.
alter table users                drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table aircraft             drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table fuel_tank            drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table parking_location     drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table flight               drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table fueler               drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table training             drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table fueler_training      drop column if exists assigned_fueler_id, drop column if exists available_at;
alter table fuel_transaction     drop column if exists assigned_fueler_id, drop column if exists available_at;

-- 2. Defaults and nullability that differ from live.
alter table flight alter column created_by_source set default 'line-department';
alter table parking_location alter column airport set default 'MSO';
update parking_location set location_code = 'LOC-' || id where location_code is null;
alter table parking_location alter column location_code set not null;
