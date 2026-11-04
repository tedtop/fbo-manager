-- Rollback for 20261104001200_rename_modified_at_to_updated_at.sql.
-- Renames updated_at back to modified_at on the 19 tables that had it before the migration (an explicit list,
-- because other tables legitimately have updated_at), restores set_modified_at() and
-- update_modified_at_column(), and puts the old triggers back. Run it together with redeploying the previous
-- build (the one that reads modified_at). The trigger dropped from the parked archive snapshot is not restored.
--
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261104001200

begin;

create or replace function public.set_modified_at()
returns trigger
language plpgsql
as $fn$
begin
  new.modified_at = now();
  return new;
end;
$fn$;

create or replace function public.update_modified_at_column()
returns trigger
language plpgsql
as $fn$
begin
  new.modified_at = now();
  return new;
end;
$fn$;

grant execute on function public.set_modified_at() to authenticated, service_role;
grant execute on function public.update_modified_at_column() to authenticated, service_role;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'aircraft', 'airport', 'customer', 'department', 'department_member', 'equipment', 'flight',
    'flight_service', 'fuel_tank', 'fuel_transaction', 'fueler', 'fueler_training', 'invoice',
    'parking_location', 'product', 'schedule_shift', 'service', 'training', 'users'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'modified_at'
    ) then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_set_updated_at', t);
      execute format('alter table public.%I rename column updated_at to modified_at', t);
      if t = 'flight' then
        execute 'create trigger update_flight_modified_at before update on public.flight for each row execute function public.update_modified_at_column()';
      else
        execute format(
          'create trigger %I before update on public.%I for each row execute function public.set_modified_at()',
          'trg_' || t || '_set_modified_at',
          t
        );
      end if;
    end if;
  end loop;

  -- set_flight_services: only its flight.updated_at write goes back
  for r in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'set_flight_services'
  loop
    execute replace(pg_get_functiondef(r.oid), 'updated_at', 'modified_at');
  end loop;
end $$;

commit;
