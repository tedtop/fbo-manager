-- Rollback for 20261104000400_app_setting.sql.
-- Drops the table, so every saved setting is lost (the app falls back to its built-in defaults).
-- Apply with: supabase db query --linked -f <this file>, then
-- supabase migration repair --linked --status reverted 20261104000400

begin;
drop table if exists public.app_setting;
drop function if exists public.app_setting_touch();
commit;
