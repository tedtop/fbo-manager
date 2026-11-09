-- Rollback for 20261108000100_fuel_meter_gaps.sql: drops the annotations (their data is lost) and the source column.
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261108000100
drop table if exists meter_gap_annotation;
alter table truck_meter_readings drop column if exists source;
