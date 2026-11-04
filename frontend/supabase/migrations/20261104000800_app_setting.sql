-- App-wide settings (key/value), one row per setting. First setting: tail_number_prefix, the text the
-- Add Flight form pre-fills into the tail number field ("N" for the US, "C-" Canada, "G-" UK, "D-" Germany).
-- Settings live in the database, not in code or env, so an FBO can change them without a deploy.
--
-- Access follows the roles/module_permissions tables: every signed-in user can read settings (the Add
-- Flight form needs the prefix), only users-module managers (can_manage_users()) can change them. anon gets
-- nothing (see 20261102000400_revoke_anon_access.sql). Values are jsonb so later settings can be numbers,
-- booleans or small objects; tail_number_prefix is a JSON string.
--
-- Additive and safe to re-run. Rollback: frontend/supabase/rollbacks/20261104000800_app_setting.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --status applied 20261104000800

begin;

create table if not exists public.app_setting (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.app_setting is 'App-wide settings, one row per key. Read by every signed-in user, written by users-module managers.';
comment on column public.app_setting.updated_by is 'auth.users id of the last person to change the value.';

create or replace function public.app_setting_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists app_setting_touch on public.app_setting;
create trigger app_setting_touch before insert or update on public.app_setting
  for each row execute function public.app_setting_touch();

alter table public.app_setting enable row level security;

drop policy if exists "Authenticated users can read settings" on public.app_setting;
create policy "Authenticated users can read settings"
  on public.app_setting for select using (auth.role() = 'authenticated');

drop policy if exists "Users admins can insert settings" on public.app_setting;
create policy "Users admins can insert settings"
  on public.app_setting for insert with check (can_manage_users());

drop policy if exists "Users admins can update settings" on public.app_setting;
create policy "Users admins can update settings"
  on public.app_setting for update using (can_manage_users()) with check (can_manage_users());

drop policy if exists "Users admins can delete settings" on public.app_setting;
create policy "Users admins can delete settings"
  on public.app_setting for delete using (can_manage_users());

-- New tables inherit Supabase's default grants (including anon): start from nothing, then grant what the
-- app needs.
revoke all on public.app_setting from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.app_setting to authenticated;
grant all on public.app_setting to service_role;

insert into public.app_setting (key, value) values ('tail_number_prefix', '"N"'::jsonb)
on conflict (key) do nothing;

commit;
