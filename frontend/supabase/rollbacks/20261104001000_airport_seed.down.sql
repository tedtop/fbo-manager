-- Rollback for 20261104001000_airport_seed.sql: empties the airport table (keeps the table).
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --linked --status reverted 20261104001000

begin;
delete from public.airport;
commit;
