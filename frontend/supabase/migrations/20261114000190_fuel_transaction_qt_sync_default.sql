-- Live drift fix found while applying B121 (2026-11-14): live fuel_transaction.qt_sync_status is NOT NULL with no
-- default (Django-era), while local (20260703000000_test_schema.sql) has default 'pending'. Without it, inserting a
-- fuel order that does not name qt_sync_status (the B121 migration and the board Fuel action) fails with 23502.
-- Both existing live rows are 'pending'. No-op locally.
-- Rollback: alter table public.fuel_transaction alter column qt_sync_status drop default;

alter table public.fuel_transaction alter column qt_sync_status set default 'pending';
