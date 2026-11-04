-- Rollback for 20261104000700_flight_hidden_at.sql.
-- Drops flight.hidden_at, so every hidden flight is back on the board (nothing else is touched).
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --linked --status reverted 20261104000700

begin;
alter table public.flight drop column if exists hidden_at;
commit;
