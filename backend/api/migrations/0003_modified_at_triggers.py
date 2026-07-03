from django.db import migrations

CREATE_TRIGGER_FUNCTION = """
CREATE OR REPLACE FUNCTION set_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

DROP_TRIGGER_FUNCTION = "DROP FUNCTION IF EXISTS set_modified_at();"

ADD_TRIGGERS = """
DROP TRIGGER IF EXISTS trg_fuel_tank_set_modified_at ON fuel_tank;
CREATE TRIGGER trg_fuel_tank_set_modified_at
    BEFORE UPDATE ON fuel_tank
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();

DROP TRIGGER IF EXISTS trg_fuel_transaction_set_modified_at ON fuel_transaction;
CREATE TRIGGER trg_fuel_transaction_set_modified_at
    BEFORE UPDATE ON fuel_transaction
    FOR EACH ROW EXECUTE FUNCTION set_modified_at();
"""

DROP_TRIGGERS = """
DROP TRIGGER IF EXISTS trg_fuel_tank_set_modified_at ON fuel_tank;
DROP TRIGGER IF EXISTS trg_fuel_transaction_set_modified_at ON fuel_transaction;
"""

ENABLE_REALTIME = """
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
    END IF;
END $$;
"""

DISABLE_REALTIME = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime DROP TABLE fuel_tank;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime DROP TABLE fuel_transaction;
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
    END IF;
END $$;
"""


class Migration(migrations.Migration):
    """
    Guarantees `modified_at` changes on every UPDATE to fuel_tank / fuel_transaction,
    at the database level, regardless of write path.

    Why this is needed: both models declare `modified_at = models.DateTimeField(auto_now=True)`,
    but `auto_now` is enforced by the Django ORM at save() time — it does nothing for writes
    that don't go through the ORM. The frontend writes these two tables directly via Supabase
    PostgREST (see frontend/repositories/tanks.repo.ts, transactions.repo.ts), which never
    touches the Django ORM, so `modified_at` was previously never updated by those writes.

    That makes `modified_at` unreliable as the optimistic-concurrency compare-and-swap guard
    used by frontend/hooks/use-record-edit-session.ts: a stale value would either never match
    (permanent false-positive conflicts) or two racing writes could both "succeed" against the
    same stale value depending on client state. A BEFORE UPDATE trigger fixes this at the one
    place all writes funnel through — the database itself.

    Scope: intentionally limited to the two tables touched by the current optimistic-concurrency
    work (fuel-farm tanks, fuel-dispatch transactions). Other tables with `modified_at`/`created_at`
    auto_now fields (equipment, training, invoicing, etc.) have the same gap if/when they're
    written to directly via Supabase, but are out of scope here — see docs/edit-concurrency.md
    for the note to future adopters. `set_modified_at()` is a generic, reusable function so
    wiring up additional tables later is a two-line trigger, not a new migration pattern.

    Also registers both tables with the `supabase_realtime` publication (no-op if that
    publication doesn't exist, e.g. plain Postgres in tests/CI) so the frontend can subscribe
    to postgres_changes for live "someone just edited this" detection.
    """

    dependencies = [
        ("api", "0002_assignedtraining"),
    ]

    operations = [
        migrations.RunSQL(sql=CREATE_TRIGGER_FUNCTION, reverse_sql=DROP_TRIGGER_FUNCTION),
        migrations.RunSQL(sql=ADD_TRIGGERS, reverse_sql=DROP_TRIGGERS),
        migrations.RunSQL(sql=ENABLE_REALTIME, reverse_sql=DISABLE_REALTIME),
    ]
