-- App Error Log
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor).
-- This is Supabase-native (not Django-managed) and general-purpose — not
-- specific to invoicing or any other single module.
--
-- Why this exists: deployment is Docker on a VPS with no log aggregation
-- set up. Container stdout is ephemeral and not queryable after the fact,
-- so when a user reports "something went wrong", there is currently no way
-- to reconstruct what actually happened. This table is that durable
-- record.
--
-- Writer: frontend/lib/error-logging.ts's logAppError() is the only
-- intended writer. It's called from frontend/lib/db-errors.ts's
-- handleWriteError() (constraint-violation handling in invoices.repo.ts /
-- transactions.repo.ts is its first real usage) and can be adopted by any
-- other part of the app later — this table is deliberately not
-- invoicing-specific.
--
-- Designed to be queryable ("what happened around timestamp X for user
-- Y?") since a future support tool (human or, per Ted's long-term idea, a
-- chatbot) may query this — see docs/architecture/fuel-invoicing-workflow.md's
-- future-phase note. No such tool is built here; this table just doesn't
-- preclude it.

CREATE TABLE IF NOT EXISTS app_error_log (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Coarse, stable bucket for grouping/querying. See ErrorCategory in
  -- lib/error-logging.ts for the exact set this app writes today; left as
  -- plain TEXT (no CHECK) so a new category never needs a migration.
  category    TEXT NOT NULL,

  -- Short machine code: a Postgres constraint name, a SQLSTATE, or an
  -- app-defined code for non-DB errors. Not shown to end users.
  error_code  TEXT NOT NULL,

  -- Human-readable summary — may match what the user saw, but this column
  -- exists for the log entry, not as the UI's source of truth.
  message     TEXT NOT NULL,

  -- Full technical detail (raw error message/stack/Postgres details+hint).
  -- NEVER surfaced to end users — for developers / a future support tool only.
  detail      TEXT,

  -- Relevant entity ids, e.g. {"invoice_id": 5, "fuel_transaction_id": 12}.
  context     JSONB,

  -- Acting user, when available from the session. No FK to auth.users on
  -- purpose: this log must still accept entries if the user record is
  -- later deleted, and service-role callers legitimately have no user.
  user_id     UUID,

  -- Where in the code this was raised, e.g. 'invoices.repo.createInvoice'.
  source      TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_error_log_occurred_at ON app_error_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_log_user_id     ON app_error_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_error_log_category    ON app_error_log(category);
CREATE INDEX IF NOT EXISTS idx_app_error_log_context_gin ON app_error_log USING GIN (context);

ALTER TABLE app_error_log ENABLE ROW LEVEL SECURITY;

-- House style (authenticated users manage all), matching every other
-- Supabase-native table in this project. Tightening this later (e.g.
-- insert-only for regular users, reads restricted to an admin/support
-- role via the existing roles/module_permissions system) is a reasonable
-- follow-up, not blocking now — there's no PII here beyond user_id.
DROP POLICY IF EXISTS "Authenticated users can manage app error log" ON app_error_log;
CREATE POLICY "Authenticated users can manage app error log"
  ON app_error_log FOR ALL
  USING (auth.role() = 'authenticated');
