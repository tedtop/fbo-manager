-- B99: manual "lowest level" override per fuel tank, set by the line manager in the Edit Tank sheet.
-- The measured lowest level comes from the Minuteman-owned tank_level_readings (read only); this table
-- is fbo-owned and only stores the override. Does NOT touch fuel_tank, tank_level_readings or
-- tank_level_min (shared with Minuteman). No sequence (tank_id is the key), so no sequence grants.
--
-- Access: every signed-in user can read and write, matching fuel_tank today (has_module_access is not
-- used because live user_roles is still empty). anon gets nothing.
--
-- Additive and safe to re-run. Rollback: frontend/supabase/rollbacks/20261111000100_fuel_tank_level_override.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --status applied 20261111000100

begin;

create table if not exists public.fuel_tank_level_override (
  tank_id             varchar(10) primary key,
  lowest_level_inches numeric(5,2) not null check (lowest_level_inches >= 0),
  note                text,
  set_by              uuid,
  set_at              timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.fuel_tank_level_override is 'Manual lowest-level override per tank (inches). Display only: does not change usable/unusable math. Row absent = no override.';
comment on column public.fuel_tank_level_override.set_by is 'auth.users id of the person who last set the value.';

create or replace function public.fuel_tank_level_override_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' or new.lowest_level_inches is distinct from old.lowest_level_inches then
    new.set_by = auth.uid();
    new.set_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists fuel_tank_level_override_touch on public.fuel_tank_level_override;
create trigger fuel_tank_level_override_touch before insert or update on public.fuel_tank_level_override
  for each row execute function public.fuel_tank_level_override_touch();

alter table public.fuel_tank_level_override enable row level security;

drop policy if exists "Authenticated users can manage tank level overrides" on public.fuel_tank_level_override;
create policy "Authenticated users can manage tank level overrides"
  on public.fuel_tank_level_override for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

revoke all on public.fuel_tank_level_override from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.fuel_tank_level_override to authenticated;
grant all on public.fuel_tank_level_override to service_role;

commit;
