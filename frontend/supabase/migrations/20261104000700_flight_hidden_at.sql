-- Hide finished flights from the board (BACKLOG B43b, docs/PLAN.md D13).
--
-- * New nullable flight.hidden_at (timestamptz). A flight is hidden once hidden_at is set and has passed:
--   staff press Hide (the app stores now()), and setting a flight to Departed stores the start of the day
--   after its departure day, so it stays on the board for the departure day and drops off the next day.
--   NULL means never hidden. The app decides the board time zone; the database only stores the instant.
-- * Backfill: flights already Departed (and not deleted) get hidden_at = their departure instant + 1 day
--   (actual departure, else scheduled departure, else last modification), so the existing pile of finished
--   flights leaves the default board too. It is an approximation of "start of the next day" (the database
--   does not know the board time zone), good enough for rows that are already history. Only rows with
--   hidden_at still NULL are touched, so a re-run changes nothing.
--
-- Additive and safe to re-run. Rollback: frontend/supabase/rollbacks/20261104000700_flight_hidden_at.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --status applied 20261104000700

begin;

alter table public.flight add column if not exists hidden_at timestamptz;

comment on column public.flight.hidden_at is 'Flight is hidden from the board once this instant has passed (Hide button, or the start of the day after it departed). NULL = never hidden.';

update public.flight
set hidden_at = coalesce(actual_departure_time, scheduled_departure_time, modified_at) + interval '1 day'
where flight_status = 'departed'
  and hidden_at is null
  and deleted_at is null;

commit;
