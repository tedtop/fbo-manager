-- Edit-Concurrency: modified_at trigger for `flight`
--
-- Part of the incremental edit-concurrency rollout (see docs/edit-concurrency.md). Guarantees
-- `modified_at` changes on every UPDATE to `flight`, at the database level, regardless of write
-- path, so it can be used as the optimistic-concurrency compare-and-swap guard by
-- frontend/hooks/use-record-edit-session.ts. Without this, `flight.modified_at` is only set to
-- its `default now()` at insert time and never updated on direct Supabase writes
-- (frontend/repositories/flights.repo.ts), making it unreliable as a conflict-detection guard.
--
-- set_modified_at() is defined via `create or replace` in
-- frontend/supabase/migrations/20260703000300_modified_at_triggers.sql, which already wires it
-- up for fuel_tank and fuel_transaction. Re-declaring it here (same `create or replace`) keeps
-- this migration self-contained and safe to apply independently.

-- ============================================================
-- 1. Trigger function (idempotent re-declaration)
-- ============================================================
create or replace function set_modified_at()
returns trigger as $$
begin
    new.modified_at = now();
    return new;
end;
$$ language plpgsql;

-- ============================================================
-- 2. Trigger
-- ============================================================
drop trigger if exists trg_flight_set_modified_at on flight;
create trigger trg_flight_set_modified_at
    before update on flight
    for each row execute function set_modified_at();

-- ============================================================
-- 3. Realtime: register `flight` so the frontend can subscribe to postgres_changes for live
--    "someone just edited this" detection. No-op if the publication doesn't exist (e.g. plain
--    Postgres in tests/CI).
-- ============================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table flight;
        exception when duplicate_object then null;
        end;
    end if;
end $$;
