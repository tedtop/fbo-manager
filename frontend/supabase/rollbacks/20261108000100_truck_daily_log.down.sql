-- Rollback of 20261108000100_truck_daily_log.sql. Drops the three log tables and everything logged in them.
drop table if exists equipment_note;
drop table if exists equipment_filter_change;
drop table if exists equipment_reading;
drop trigger if exists trg_equipment_status_changed on equipment;
drop function if exists equipment_stamp_status_changed();
alter table equipment drop column if exists status_changed_at;
alter table equipment add column if not exists dpi_reading text not null default '';
