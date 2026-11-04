-- Rollback for 20261104000400_fuel_transaction_timestamp_defaults.sql.
-- Removes the DEFAULT now() again; inserts must then send created_at and modified_at themselves
-- (createTransaction did, before the default existed). No data changes.
--
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --linked --status reverted 20261104000400

begin;
alter table public.fuel_transaction
  alter column created_at drop default,
  alter column modified_at drop default;
commit;
