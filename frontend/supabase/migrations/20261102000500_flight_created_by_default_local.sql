-- LOCAL/TEST PARITY (F8): mirror live, where `flight.created_by_id` already has DEFAULT 1.
-- The local test schema (20260703000000_test_schema.sql) declared it NOT NULL with no default, so
-- any create through the app (which never sets created_by_id) failed locally with 23502.
-- A no-op on live (the default is already 1). Touches ONLY flight.created_by_id's default; it does
-- not insert into or alter `users` (a users row with id 1 comes from the e2e/test seeds locally).
alter table flight alter column created_by_id set default 1;
