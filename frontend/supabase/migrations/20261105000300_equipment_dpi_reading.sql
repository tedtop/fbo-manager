-- Fuel trucks: last filter differential-pressure (DPI) reading, free text because the gauge is read as e.g. "5/32".
-- Editing it bumps equipment.updated_at via the existing set_updated_at trigger, which the list card shows as "Last updated".
alter table equipment add column dpi_reading text not null default '';
