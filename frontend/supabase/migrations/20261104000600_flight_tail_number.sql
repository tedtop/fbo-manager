-- Rename the legacy column flight.aircraft_id to flight.tail_number (it already holds the tail number and is a
-- foreign key to aircraft(tail_number)). Constraint fk_flight_aircraft and index idx_flight_aircraft follow the
-- rename automatically and keep their names. No functions, views or policies reference the column.
--
-- Guarded and safe to re-run: renames only when aircraft_id exists and tail_number does not.
-- Rollback: frontend/supabase/rollbacks/20261104000600_flight_tail_number.down.sql
-- Apply to live ONLY with: supabase db query --linked --yes -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --yes --status applied 20261104000600

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flight' and column_name = 'aircraft_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flight' and column_name = 'tail_number'
  ) then
    alter table public.flight rename column aircraft_id to tail_number;
  end if;
end $$;

comment on column public.flight.tail_number is 'Tail number of the aircraft (FK to aircraft.tail_number). Formerly named aircraft_id.';

commit;
