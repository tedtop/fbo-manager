-- Rollback for 20261104000600_flight_tail_number.sql.
-- Renames flight.tail_number back to flight.aircraft_id (only if aircraft_id does not exist).
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261104000600

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flight' and column_name = 'tail_number'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flight' and column_name = 'aircraft_id'
  ) then
    alter table public.flight rename column tail_number to aircraft_id;
  end if;
end $$;

commit;
