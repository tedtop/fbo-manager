-- Rollback for 20261103000100_flight_time_model.sql (BACKLOG B01c/B09).
--
-- Restores arrival_time / departure_time and the NOT NULL on departure_time. This FAILS (and rolls
-- back, nothing is changed) if any flight has no scheduled_departure_time, because the old schema
-- cannot represent arrival-only rows. In that case fix or delete those rows deliberately first.
-- DROPS actual_arrival_time, actual_departure_time and is_quick_turn: their data is lost, so take a
-- backup first (select * from flight).
--
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --status reverted 20261103000100

begin;

alter table public.flight drop constraint if exists flight_has_scheduled_time_check;
alter table public.flight drop column if exists actual_arrival_time;
alter table public.flight drop column if exists actual_departure_time;
alter table public.flight drop column if exists is_quick_turn;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'flight' and column_name = 'scheduled_arrival_time') then
    alter table public.flight rename column scheduled_arrival_time to arrival_time;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'flight' and column_name = 'scheduled_departure_time') then
    alter table public.flight rename column scheduled_departure_time to departure_time;
  end if;
end $$;

alter table public.flight alter column departure_time set not null;

comment on column public.flight.arrival_time is null;
comment on column public.flight.departure_time is null;

commit;
