-- Rollback for 20261104001300_service_tks_fluid_quantity.sql (B26f).
-- Destroys the tks_fluid service and every flight_service row that uses it (including quantities), then
-- drops service.quantity_unit. Also remove the version from the migration history if it was recorded:
--   supabase migration repair --linked --yes --status reverted 20261104001300

begin;
delete from flight_service where service_id in (select id from service where key = 'tks_fluid');
delete from service where key = 'tks_fluid';
alter table service drop constraint if exists service_quantity_unit_check;
alter table service drop column if exists quantity_unit;
commit;
