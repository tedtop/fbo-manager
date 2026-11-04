-- Rollback for 20261104000900_airport_table.sql (also removes the rows loaded by 20261104001000_airport_seed.sql).
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --linked --status reverted 20261104000900
-- and, if the seed was applied: supabase migration repair --linked --status reverted 20261104001000

begin;
drop table if exists public.airport;
commit;
