-- Rollback for 20261113000500_last_active_admin_guard.sql: drops the triggers and functions (the app-side guard stays).
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261113000500
drop trigger if exists trg_user_roles_flag_admin on user_roles;
drop trigger if exists trg_user_roles_last_admin on user_roles;
drop trigger if exists trg_profiles_flag_admin on profiles;
drop trigger if exists trg_profiles_last_admin on profiles;
drop function if exists public.enforce_last_active_admin();
drop function if exists public.flag_admin_change();
drop function if exists public.is_active_administrator(uuid);
