-- Rollback for 20261104001400_google_signin_roles.sql.
-- Restores the old role names, removes the Customer role (only when nobody holds it), drops the
-- access snapshot RPC and the profile column guard, and puts the original profile trigger body back.
-- Management is NOT recreated (it held no assignments when it was removed; re-add from migration 20260703000200 if needed).
-- Also remove the version from the migration history if it was recorded:
--   supabase migration repair --linked --yes --status reverted 20261104001400

begin;

drop trigger if exists trg_profiles_guard_columns on profiles;
drop function if exists guard_profile_columns();
drop function if exists get_my_access();

create or replace function has_module_access(p_module text, p_min_level text default 'view')
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join module_permissions mp on mp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and mp.module = p_module
      and (p_min_level = 'view' or mp.access_level = 'manage')
  );
$$;

update roles set name = 'Office Staff' where name = 'Front Desk';
update roles set name = 'Line Technician' where name = 'Line Department';
delete from roles r where r.name = 'Customer' and not exists (select 1 from user_roles ur where ur.role_id = r.id);

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
