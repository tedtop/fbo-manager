-- fuel_transaction.created_at / modified_at are NOT NULL with no default on live (Django-era table), so an
-- INSERT that does not send them fails: 'null value in column "created_at" ... violates not-null
-- constraint' (seen on the New Fuel Order form, 2026-11-04). NOT NULL only rejects a missing value, it never
-- fills one in; the default does. Local already has these defaults, which is why tests never caught it.
--
-- modified_at on UPDATE is already handled: trg_fuel_transaction_set_modified_at (set_modified_at) exists on
-- live. Additive only: sets DEFAULT now(); no data changes, nothing dropped.
-- Ted approved altering this table on live (2026-11-04).
--
-- Safe to re-run. Rollback: frontend/supabase/rollbacks/20261104000400_fuel_transaction_timestamp_defaults.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --status applied 20261104000400

begin;
alter table public.fuel_transaction
  alter column created_at set default now(),
  alter column modified_at set default now();
commit;
