-- Edit-Concurrency: modified_at trigger for equipment
--
-- Folds frontend/scripts/equipment-modified-at-trigger.sql (previously a manually-run
-- script, never part of the migration chain) into a proper migration, so stacks built
-- from supabase/migrations (vitest repo suite, Playwright E2E suite, a fresh
-- `supabase db reset`) actually get this trigger. Same rationale as
-- 20260703000300_modified_at_triggers.sql (fuel_tank/fuel_transaction): equipment's
-- modified_at is not guaranteed to change on every write unless enforced at the
-- database level, which the edit-concurrency compare-and-swap guard in
-- frontend/hooks/use-record-edit-session.ts depends on. See docs/edit-concurrency.md.
--
-- set_modified_at() is defined with CREATE OR REPLACE, so this is safe to run whether
-- or not modified_at_triggers.sql has already been applied.

create or replace function set_modified_at()
returns trigger as $$
begin
    new.modified_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_equipment_set_modified_at on equipment;
create trigger trg_equipment_set_modified_at
    before update on equipment
    for each row execute function set_modified_at();

-- Realtime: register the table so the frontend can subscribe to postgres_changes for
-- live "someone just edited this" detection. No-op if the publication doesn't exist
-- (e.g. plain Postgres in tests/CI).
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        begin
            alter publication supabase_realtime add table equipment;
        exception when duplicate_object then null;
        end;
    end if;
end $$;
