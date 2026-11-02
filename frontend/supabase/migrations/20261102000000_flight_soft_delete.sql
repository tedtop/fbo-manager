-- Soft delete for `flight`
--
-- Deleting a flight from the arrivals/departures board now stamps `deleted_at` instead of removing
-- the row, so cleared flights can still be looked up later. The app filters on `deleted_at is null`
-- (frontend/repositories/flights.repo.ts). The existing set_modified_at trigger bumps `modified_at`
-- on the stamping UPDATE, so edit-concurrency still sees a delete as a change.

alter table flight add column if not exists deleted_at timestamptz;

comment on column flight.deleted_at is
    'Set when a flight is deleted from the board. NULL = active. Rows are never hard-deleted by the app.';

-- The board only ever reads active flights, ordered by departure_time.
create index if not exists idx_flight_active_departure_time
    on flight (departure_time desc)
    where deleted_at is null;
