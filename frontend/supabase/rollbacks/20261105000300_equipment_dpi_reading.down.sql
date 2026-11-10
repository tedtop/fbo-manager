-- Rollback of 20261105000300_equipment_dpi_reading.sql. Drops the column and the readings in it.
alter table equipment drop column if exists dpi_reading;
