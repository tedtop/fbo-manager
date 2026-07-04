-- Edit-Concurrency: modified_at trigger for equipment
-- Run this in the Supabase SQL Editor (supabase.com/dashboard -> SQL Editor).
--
-- Same rationale as frontend/scripts/modified-at-triggers.sql (fuel_tank/fuel_transaction):
-- equipment.modified_at is not guaranteed to change on every write unless enforced at
-- the database level, which the edit-concurrency compare-and-swap guard in
-- frontend/hooks/use-record-edit-session.ts depends on. See docs/edit-concurrency.md.
--
-- set_modified_at() is defined with CREATE OR REPLACE, so this is safe to run whether
-- or not modified-at-triggers.sql has already been applied.

CREATE OR REPLACE FUNCTION set_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipment_set_modified_at ON equipment;
CREATE TRIGGER trg_equipment_set_modified_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

-- Realtime: register the table so the frontend can subscribe to postgres_changes for
-- live "someone just edited this" detection. No-op if the publication doesn't exist
-- (e.g. plain Postgres in tests/CI).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
