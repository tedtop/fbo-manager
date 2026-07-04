-- Edit-Concurrency: modified_at triggers, materialized as a migration.
--
-- These triggers already exist as manually-applied scripts
-- (frontend/scripts/modified-at-triggers.sql, equipment-modified-at-trigger.sql — run
-- via the Supabase SQL Editor against the live project), but were never part of the
-- migration chain, so any stack built from supabase/migrations (the vitest repo suite,
-- the Playwright E2E suite, a fresh `supabase db reset`) had NO trigger: modified_at
-- never changed on UPDATE and the optimistic-concurrency compare-and-swap guard in
-- frontend/hooks/use-record-edit-session.ts could not detect anything. See
-- docs/edit-concurrency.md — the trigger is a hard requirement of that mechanism.
--
-- Everything here is idempotent (CREATE OR REPLACE / DROP IF EXISTS / duplicate_object
-- guards), so it is safe against a database where the scripts were already run by hand.

CREATE OR REPLACE FUNCTION set_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_tank_set_modified_at ON fuel_tank;
CREATE TRIGGER trg_fuel_tank_set_modified_at
    BEFORE UPDATE ON fuel_tank
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

DROP TRIGGER IF EXISTS trg_fuel_transaction_set_modified_at ON fuel_transaction;
CREATE TRIGGER trg_fuel_transaction_set_modified_at
    BEFORE UPDATE ON fuel_transaction
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

DROP TRIGGER IF EXISTS trg_equipment_set_modified_at ON equipment;
CREATE TRIGGER trg_equipment_set_modified_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

-- Realtime: register the tables so the frontend can subscribe to postgres_changes for
-- live "someone just edited this" detection. No-op if the publication doesn't exist
-- (e.g. plain Postgres in tests/CI).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE fuel_tank;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE fuel_transaction;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
