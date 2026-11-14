-- B94: re-revoke anon grants that later migrations re-added after the B29 lockdown.
--
-- 20261102000400_revoke_anon_access.sql (B29) revoked anon on all public tables, sequences and
-- functions. Migrations ordered after it (20261105000100_parking_areas,
-- 20261108000200_fuel_meter_gaps) ended with the copy-pasted
-- `grant all on all sequences in schema public to anon, authenticated, service_role` (and a table
-- grant to anon), so a fresh replay, and live once B29 is applied before them, hands anon back
-- USAGE on every sequence (nextval can burn ids; no table data) plus the two tables below.
-- Those older migrations are already applied on live and are not edited; this fixes forward.
--
-- Tables touched: parking_area, meter_gap_annotation (anon privileges only; idempotent).
-- Does NOT touch service_role, authenticated rights, row data, Minuteman tables or fuel_tank_readings.
--
-- Apply to live TOGETHER WITH / right after B29's 20261102000400, waits for Ted:
--   supabase db query --linked -f <this file>   (NEVER `supabase db push`)
--
-- Rollback (only if something legitimate broke):
--   grant usage, select on all sequences in schema public to anon;

begin;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

commit;
