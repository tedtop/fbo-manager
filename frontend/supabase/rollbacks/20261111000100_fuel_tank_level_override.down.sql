-- Rollback for 20261111000100_fuel_tank_level_override.sql: drops the overrides (their data is lost).
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261111000100
drop table if exists public.fuel_tank_level_override;
drop function if exists public.fuel_tank_level_override_touch();
