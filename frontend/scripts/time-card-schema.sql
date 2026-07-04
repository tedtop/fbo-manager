-- Time card scans: storage + linkage scaffolding.
-- Run this in the Supabase SQL Editor (supabase.com/dashboard -> SQL Editor).
--
-- SCOPE: this is schema/storage scaffolding ONLY. Ted will provide actual
-- scans of the physical time cards later; until then there is nothing to
-- build OCR/extraction logic against, and this script deliberately does
-- not guess at the paper format. All it does is give scans somewhere to
-- land (a private Storage bucket) and a table linking a scan to the
-- relevant department_member and pay period, so uploads can start the
-- moment real examples show up.
--
-- Relationship to PR #31 (feat/fuel-invoicing-workflow, not yet merged as
-- of this writing): that branch introduces a general `scanned_documents`
-- table + a private 'scans' bucket for truck-sheet/invoice-slip scans. If
-- it lands first, the natural follow-up is to fold time cards into that
-- same table (add 'time_card' to its doc_type CHECK, add a nullable
-- department_member_id/pay_period linkage, migrate rows, drop this table)
-- rather than running two parallel scan tables forever. Kept as its own
-- table for now (rather than guessing at scanned_documents' final shape
-- before that PR lands) specifically so it:
--   - reuses the SAME 'scans' bucket by id (the bucket insert below is
--     `on conflict do nothing`, so it's a no-op if #31 already created it,
--     and harmless if it lands afterward),
--   - never collides on table name with `scanned_documents`,
--   - mirrors that table's shape closely (storage_bucket/storage_path/
--     original_filename/content_type/byte_size/page_number/uploaded_by/
--     notes/created_at) so a future merge is a mechanical column add +
--     data migration, not a redesign.
--
-- Data model:
--   department_member  <- existing staff roster (frontend/scripts/line-schedule-schema.sql)
--   time_card_scan      <- one row per uploaded photo/page of a time card
--
-- ============================================================
-- 1. TIME CARD SCANS
--    Both linkage columns are nullable: per the same resilience posture as
--    scanned_documents, a scan can be uploaded before anyone has confirmed
--    which employee/pay period it belongs to, and linked later.
-- ============================================================
CREATE TABLE IF NOT EXISTS time_card_scan (
  id                  BIGSERIAL PRIMARY KEY,
  department_member_id INTEGER REFERENCES department_member(id) ON DELETE SET NULL,
  pay_period_start   DATE,
  pay_period_end     DATE,
  storage_bucket     TEXT   NOT NULL DEFAULT 'scans',
  storage_path       TEXT   NOT NULL UNIQUE,
  original_filename  TEXT   NOT NULL,
  content_type       TEXT   NOT NULL,
  byte_size          BIGINT,
  page_number        INTEGER,          -- 1-based page order for multi-page time cards
  uploaded_by        UUID,             -- auth.uid() of the uploader, when available
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pay_period_end IS NULL OR pay_period_start IS NULL OR pay_period_end >= pay_period_start)
);

CREATE INDEX IF NOT EXISTS idx_time_card_scan_member
  ON time_card_scan(department_member_id) WHERE department_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_card_scan_period
  ON time_card_scan(pay_period_start) WHERE pay_period_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_card_scan_unlinked
  ON time_card_scan(created_at DESC)
  WHERE department_member_id IS NULL AND pay_period_start IS NULL;

COMMENT ON TABLE time_card_scan IS 'Original scans of physical time cards, linked to a department_member and pay period once known. No extraction/OCR logic yet -- pending real scan samples.';

-- Private bucket: time cards are payroll paperwork; access via signed URLs
-- only. Shared with PR #31's truck-sheet/invoice-slip scans by design (same
-- bucket id) -- safe to run whether or not that PR has merged yet.
INSERT INTO storage.buckets (id, name, public)
VALUES ('scans', 'scans', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can manage scans" ON storage.objects;
CREATE POLICY "Authenticated users can manage scans"
  ON storage.objects FOR ALL
  USING (bucket_id = 'scans' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'scans' AND auth.role() = 'authenticated');

-- ============================================================
-- 2. RLS (house style for the recent scan/document tables: authenticated
--    users manage all)
-- ============================================================
ALTER TABLE time_card_scan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage time card scans" ON time_card_scan;
CREATE POLICY "Authenticated users can manage time card scans"
  ON time_card_scan FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- NOT done here (intentionally, see scope note above):
--   * No OCR/extraction of hours, dates, or employee identity from the
--     scanned image -- waiting on real physical time card samples from Ted.
--   * No UI for upload/review yet -- this is storage + linkage scaffolding
--     only, mirroring frontend/repositories/time-card-scans.repo.ts.
--   * No reconciliation with PR #31's `scanned_documents` table -- see the
--     relationship note above for the intended follow-up once that PR lands.
--
-- After running, regenerate types:
--   cd frontend && npx supabase gen types typescript --schema public --project-id qkuhvlrdidhumyyxokil > types/database.ts
-- ============================================================
