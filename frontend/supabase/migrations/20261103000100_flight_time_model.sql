-- Flight time model: scheduled + actual times, quick-turn flag (BACKLOG B09, docs/PLAN.md D2/D6, F1).
--
-- * arrival_time   -> scheduled_arrival_time    (rename, data kept)
-- * departure_time -> scheduled_departure_time  (rename, data kept)
-- * both scheduled times become nullable, with a CHECK that at least one is set (D6: a hangared
--   plane may have only a departure (pulled out) or only an arrival (returning)).
-- * new actual_arrival_time / actual_departure_time (nullable timestamptz).
-- * new is_quick_turn boolean not null default false; backfilled true where both scheduled times
--   exist and the gap is <= 60 minutes.
--
-- Indexes follow the renamed columns automatically (their names keep the old spelling). Verified
-- read-only against live 2026-11-03: no views, matviews, functions, policies or other constraints
-- reference the old column names; the only trigger on flight (modified_at) is column-agnostic.
--
-- Safe to re-run: every step is guarded. Rollback: frontend/supabase/rollbacks/20261103000100_flight_time_model.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --status applied 20261103000100

begin;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'flight' and column_name = 'arrival_time') then
    alter table public.flight rename column arrival_time to scheduled_arrival_time;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'flight' and column_name = 'departure_time') then
    alter table public.flight rename column departure_time to scheduled_departure_time;
  end if;
end $$;

alter table public.flight alter column scheduled_arrival_time drop not null;
alter table public.flight alter column scheduled_departure_time drop not null;

alter table public.flight add column if not exists actual_arrival_time timestamptz;
alter table public.flight add column if not exists actual_departure_time timestamptz;
alter table public.flight add column if not exists is_quick_turn boolean not null default false;

-- Existing rows all have a departure, so the CHECK validates immediately.
alter table public.flight drop constraint if exists flight_has_scheduled_time_check;
alter table public.flight add constraint flight_has_scheduled_time_check
  check (scheduled_arrival_time is not null or scheduled_departure_time is not null);

update public.flight
   set is_quick_turn = true
 where scheduled_arrival_time is not null
   and scheduled_departure_time is not null
   and scheduled_departure_time - scheduled_arrival_time <= interval '60 minutes'
   and is_quick_turn = false;

comment on column public.flight.scheduled_arrival_time is 'Planned arrival. NULL for a departure-only (hangar pull) flight.';
comment on column public.flight.scheduled_departure_time is 'Planned departure. NULL for an arrival-only (return to hangar) flight.';
comment on column public.flight.actual_arrival_time is 'Actual arrival, filled in by staff when known.';
comment on column public.flight.actual_departure_time is 'Actual departure, filled in by staff when known.';
comment on column public.flight.is_quick_turn is 'Quick turn (QT): appears in both Arrivals and Departures; departure is arrival + 1 h.';

commit;
