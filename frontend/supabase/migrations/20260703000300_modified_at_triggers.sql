-- Edit-Concurrency: modified_at triggers
--
-- Guarantees `modified_at` changes on every UPDATE to fuel_tank / fuel_transaction,
-- at the database level, regardless of write path.
--
-- Why this is needed: both tables' modified_at columns were historically maintained
-- by Django's `auto_now=True`, which is enforced by the Django ORM at save() time —
-- it does nothing for writes that don't go through the ORM. The frontend writes these
-- two tables directly via Supabase PostgREST (see frontend/repositories/tanks.repo.ts,
-- transactions.repo.ts), which never touches the Django ORM, so `modified_at` was
-- previously never updated by those writes.
--
-- That makes `modified_at` unreliable as the optimistic-concurrency compare-and-swap
-- guard used by frontend/hooks/use-record-edit-session.ts: a stale value would either
-- never match (permanent false-positive conflicts) or two racing writes could both
-- "succeed" against the same stale value depending on client state. A BEFORE UPDATE
-- trigger fixes this at the one place all writes funnel through — the database itself.
--
-- Scope: intentionally limited to the two tables touched by the current
-- optimistic-concurrency work (fuel-farm tanks, fuel-dispatch transactions). Other
-- tables with modified_at/created_at auto_now fields (equipment, training, invoicing,
-- etc.) have the same gap if/when they're written to directly via Supabase, but are
-- out of scope here — see docs/edit-concurrency.md for the note to future adopters.
-- set_modified_at() is a generic, reusable function so wiring up additional tables
-- later is a two-line trigger in a new migration, not a new pattern.

-- ============================================================
-- 1. Trigger function
-- ============================================================
create or replace function set_modified_at()
returns trigger as $$
begin
    new.modified_at = now();
    return new;
end;
$$ language plpgsql;

-- ============================================================
-- 2. Triggers
-- ============================================================
drop trigger if exists trg_fuel_tank_set_modified_at on fuel_tank;
create trigger trg_fuel_tank_set_modified_at
    before update on fuel_tank
    for each row execute function set_modified_at();

drop trigger if exists trg_fuel_transaction_set_modified_at on fuel_transaction;
create trigger trg_fuel_transaction_set_modified_at
    before update on fuel_transaction
    for each row execute function set_modified_at();

-- ============================================================
-- 3. Realtime: register both tables so the frontend can subscribe to
--    postgres_changes for live "someone just edited this" detection.
--    No-op if the publication doesn't exist (e.g. plain Postgres in tests/CI).
-- ============================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table fuel_tank;
        exception when duplicate_object then null;
        end;
        begin
            alter publication supabase_realtime add table fuel_transaction;
        exception when duplicate_object then null;
        end;
    end if;
end $$;
