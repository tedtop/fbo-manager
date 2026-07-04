-- Fuel Dispatch ↔ Truck Sheets ↔ Invoicing workflow linkage
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor).
-- These changes are Supabase-native (not Django-managed).
--
-- DEPENDS ON (run first, in order):
--   scripts/truck-sheets-schema.sql   (truck_sheets, truck_meter_readings)
--   scripts/invoicing-schema.sql      (invoices, invoice_line_items, invoice_fuel_readings)
--   scripts/fuel-order-schema.sql     (fuel_transaction dispatch columns)
--
-- Design doc: docs/architecture/fuel-invoicing-workflow.md (ER + sequence diagrams).
--
-- What this migration models (the real paper workflow on the ramp):
--   * fuel_transaction is the LIVE dispatch record — created when a fueling is
--     radioed in / dispatched, usually with NO meter numbers (too much data
--     entry for a line tech on the radio). Just tail number, gallons, a
--     free-form request.
--   * truck_meter_readings rows arrive LATER, when the paper truck sheet is
--     scanned (OCR) — they carry the real Meter Start/End numbers and link
--     BACK to the dispatch record once matched. Nullable FK, matched
--     asynchronously; sheets will not be scanned consistently, so nothing
--     here is required at creation time.
--   * A fuel_transaction becomes exactly ONE line item on an invoice (other
--     line items — services, fluids, ramp fees — are added separately by the
--     front desk). A partial unique index prevents billing the same fueling
--     twice.
--   * Two invoice-number regimes exist:
--       - dash format, e.g. '26-3330' — issued LIVE by the accounting
--         software while the line tech waits on the radio (GA traffic);
--       - plain 5-digit book serial, e.g. '21483' — pre-printed in red in a
--         carbon-copy paper invoice book (airlines). The slip is filled by
--         hand at fueling time and accounting picks the copies up around
--         midday, so there is a real, expected batch delay before the
--         invoice is "known". invoices.number_source + accounting_picked_up_at
--         model that pending-pickup state.
--   * Original scans of BOTH paper document types (truck sheets AND invoice
--     slips) are persisted in Supabase Storage via the scanned_documents
--     table + the private 'scans' bucket (today only OCR JSON survives; the
--     photos are discarded).
--
-- Data-resilience posture (hard requirement): every linkage below is
-- nullable and populated after the fact. A fuel_transaction with no sheet
-- row, a sheet row with no transaction, and an invoice with neither must all
-- remain valid states — incomplete data is the norm during adoption, not an
-- error.

-- ============================================================
-- 1. fuel_transaction: dispatch-time fields
--    - fuel_order_text is renamed to fuel_request (Ted's field name; the
--      dispatch UI already labels it "Fuel Request"). It holds the request
--      exactly as written/radioed, e.g. 'T/O' or '110/s Jet A+'.
--    - gallons_requested: best-effort number parsed from fuel_request;
--      NULL whenever it can't be trivially derived (e.g. 'T/O', lbs
--      requests). Never required.
--    - gallons_delivered: the number actually radioed in to the front desk
--      (a.k.a. "gallons pumped" on the sheet — this name preferred).
--      Distinct from the legacy quantity_gallons (QT-era ordered quantity),
--      which is left untouched.
--    - customer_name: who to bill, as radioed/written ("Life Flight",
--      'UA 5996'). Matches truck sheet "Customer" and invoice "Name".
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fuel_transaction' AND column_name = 'fuel_order_text'
  ) THEN
    ALTER TABLE fuel_transaction RENAME COLUMN fuel_order_text TO fuel_request;
  END IF;
END $$;

ALTER TABLE fuel_transaction
  ADD COLUMN IF NOT EXISTS fuel_request       TEXT,
  ADD COLUMN IF NOT EXISTS gallons_requested  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gallons_delivered  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS customer_name      TEXT;

COMMENT ON COLUMN fuel_transaction.fuel_request      IS 'Free-form request as written on the truck sheet / radioed in, e.g. ''T/O'', ''110/s Jet A+''. Renamed from fuel_order_text.';
COMMENT ON COLUMN fuel_transaction.gallons_requested IS 'Best-effort number parsed from fuel_request; NULL when not trivially derivable (T/O, lbs requests, etc.).';
COMMENT ON COLUMN fuel_transaction.gallons_delivered IS 'Gallons actually pumped, as radioed in to front desk (name preferred over gallons_pumped).';
COMMENT ON COLUMN fuel_transaction.customer_name     IS 'Customer as radioed/written — matches truck sheet Customer column and invoice Name field.';

-- ============================================================
-- 2. truck_meter_readings → fuel_transaction: the async
--    scan-reconciliation link.
--    The scanned sheet row points back to the dispatch record once matched
--    (by tail number + date + gallons + invoice number). Intentionally NOT
--    unique: a single big fueling can span multiple sheet rows (front +
--    rear register on Jet A trucks). Double-billing is prevented at the
--    invoice_line_items level (section 4), not here.
-- ============================================================
ALTER TABLE truck_meter_readings
  ADD COLUMN IF NOT EXISTS fuel_transaction_id BIGINT
    REFERENCES fuel_transaction(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_truck_meter_readings_fuel_transaction
  ON truck_meter_readings(fuel_transaction_id)
  WHERE fuel_transaction_id IS NOT NULL;

COMMENT ON COLUMN truck_meter_readings.fuel_transaction_id IS 'Matched dispatch record. Populated asynchronously when the scanned sheet is reconciled — never required.';

-- ============================================================
-- 3. Per-tank before/after readings (airline fuelings only).
--    Recorded on the invoice slip and per-airline paperwork for airline
--    aircraft: 737 uses L/C/R tanks, E175 uses L/R/T. tank_position is
--    free-form TEXT on purpose — other types/layouts must not require a
--    migration. Units are usually lbs (gauge readings), occasionally gal.
--    Optional for every transaction; GA fuelings never have these.
--    (invoice_fuel_readings remains the transcription of what's printed in
--    the invoice DESCRIPTION block; this table is the transaction-side
--    record, attached to the fueling event itself.)
-- ============================================================
CREATE TABLE IF NOT EXISTS fuel_transaction_tank_readings (
  id                  BIGSERIAL PRIMARY KEY,
  fuel_transaction_id BIGINT NOT NULL REFERENCES fuel_transaction(id) ON DELETE CASCADE,
  tank_position       TEXT   NOT NULL CHECK (tank_position <> ''),  -- 'L','C','R','T', wing/aux names — free-form by design
  reading_before      NUMERIC(12,1),
  reading_after       NUMERIC(12,1),
  reading_unit        TEXT   NOT NULL DEFAULT 'lbs' CHECK (reading_unit IN ('lbs', 'gal', 'kg')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fuel_transaction_id, tank_position)
);

CREATE INDEX IF NOT EXISTS idx_fuel_tx_tank_readings_tx
  ON fuel_transaction_tank_readings(fuel_transaction_id);

-- ============================================================
-- 4. invoice_line_items → fuel_transaction: the billing link.
--    A fuel_transaction is billed as at most ONE invoice line item (partial
--    unique index). truck_meter_reading_id is kept for provenance/back-compat
--    (which sheet row the meter data came from) but fuel_transaction_id is
--    now the primary fueling↔invoice relationship.
--    ON DELETE RESTRICT: a billed dispatch record cannot be deleted out from
--    under its invoice — void the invoice first (voiding clears the link).
-- ============================================================
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS fuel_transaction_id BIGINT
    REFERENCES fuel_transaction(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_line_items_fuel_transaction
  ON invoice_line_items(fuel_transaction_id)
  WHERE fuel_transaction_id IS NOT NULL;

COMMENT ON COLUMN invoice_line_items.fuel_transaction_id IS 'The fueling billed by this line. Partial unique index prevents billing the same fuel_transaction twice.';

-- ============================================================
-- 5. invoices: the two invoice-number regimes.
--    number_source:
--      'live'       – dash format ('26-3330'), issued immediately by the
--                     accounting software while the line tech waits.
--      'paper_book' – 5-digit serial ('21483') pre-printed in the carbon
--                     invoice book; filled by hand, top copy dropped in the
--                     box, accounting collects around midday.
--    Pending-pickup state is DERIVED, not a status enum value:
--      pending  = number_source = 'paper_book' AND accounting_picked_up_at IS NULL
--    No format CHECK on invoice_number on purpose — hand-written numbers are
--    messy and the resilience posture forbids rejecting them.
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS number_source TEXT NOT NULL DEFAULT 'live'
    CHECK (number_source IN ('live', 'paper_book')),
  ADD COLUMN IF NOT EXISTS accounting_picked_up_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.number_source           IS '''live'' = dash-format number issued immediately by accounting software; ''paper_book'' = pre-printed 5-digit book serial (airlines).';
COMMENT ON COLUMN invoices.accounting_picked_up_at IS 'When accounting collected the paper book copy (midday pickup). NULL + paper_book = pending pickup. Irrelevant for live invoices.';

-- Backfill: classify existing invoices by number shape. 5-digit all-numeric =
-- book serial; anything with a dash = live. Existing non-draft book invoices
-- are assumed already collected (they were entered into this system at all).
UPDATE invoices SET number_source = 'paper_book' WHERE invoice_number ~ '^\d{5}$';
UPDATE invoices
  SET accounting_picked_up_at = created_at
  WHERE number_source = 'paper_book' AND status IN ('open', 'paid');

CREATE INDEX IF NOT EXISTS idx_invoices_pending_pickup
  ON invoices(invoice_date)
  WHERE number_source = 'paper_book' AND accounting_picked_up_at IS NULL;

-- ============================================================
-- 6. scanned_documents + Storage: persist the original photos of BOTH paper
--    document types. One private bucket ('scans'); path convention
--    {doc_type}/{yyyy}/{mm}/{uuid}-{filename}. A truck sheet can have
--    several pages (several rows here); an invoice slip is one image.
--    Rows can exist before their document is matched to a truck_sheet /
--    invoice — both FKs nullable, linked later like everything else.
-- ============================================================
CREATE TABLE IF NOT EXISTS scanned_documents (
  id                BIGSERIAL PRIMARY KEY,
  doc_type          TEXT   NOT NULL CHECK (doc_type IN ('truck_sheet', 'invoice_slip')),
  storage_bucket    TEXT   NOT NULL DEFAULT 'scans',
  storage_path      TEXT   NOT NULL UNIQUE,
  original_filename TEXT   NOT NULL,
  content_type      TEXT   NOT NULL,
  byte_size         BIGINT,
  page_number       INTEGER,          -- 1-based page order for multi-page truck sheets
  truck_sheet_id    BIGINT REFERENCES truck_sheets(id) ON DELETE SET NULL,
  invoice_id        BIGINT REFERENCES invoices(id)     ON DELETE SET NULL,
  uploaded_by       UUID,             -- auth.uid() of the uploader, when available
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanned_documents_truck_sheet
  ON scanned_documents(truck_sheet_id) WHERE truck_sheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_documents_invoice
  ON scanned_documents(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanned_documents_type_date
  ON scanned_documents(doc_type, created_at DESC);

-- Private bucket: scans are business paperwork; access via signed URLs only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('scans', 'scans', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can manage scans" ON storage.objects;
CREATE POLICY "Authenticated users can manage scans"
  ON storage.objects FOR ALL
  USING (bucket_id = 'scans' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'scans' AND auth.role() = 'authenticated');

-- ============================================================
-- 7. Per-truck running fuel level ("Remaining Gallons" column).
--    The paper sheet keeps a hand-computed running total per truck per day:
--    row remaining = previous remaining (or the day's starting gallons)
--    minus gallons pumped; tank fills / transfers-in add fuel back.
--    (~/src/minuteman was checked per standing instruction: its fuel-farm
--    module tracks FARM tanks via inches→gallons calibration tables and has
--    no per-truck running total to copy, so this view is new logic.)
--    The view derives the expected value from starting_gallons + the ordered
--    rows and exposes the as-written value beside it, so the UI can show
--    discrepancies instead of silently trusting either number.
-- ============================================================
CREATE OR REPLACE VIEW truck_sheet_running_totals AS
SELECT
  r.id                AS reading_id,
  r.truck_sheet_id,
  s.sheet_date,
  s.truck_number,
  r.line_number,
  r.reading_type,
  r.gallons_pumped,
  r.gallons_remaining AS gallons_remaining_written,
  s.starting_gallons
    + SUM(
        CASE
          WHEN r.reading_type IN ('tank_fill', 'transfer_in') THEN COALESCE(r.gallons_pumped, 0)
          ELSE -COALESCE(r.gallons_pumped, 0)
        END
      ) OVER (
        PARTITION BY r.truck_sheet_id
        ORDER BY r.line_number
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )               AS gallons_remaining_computed
FROM truck_meter_readings r
JOIN truck_sheets s ON s.id = r.truck_sheet_id;

COMMENT ON VIEW truck_sheet_running_totals IS 'Derived per-truck running fuel level per sheet row, alongside the hand-written value, for discrepancy checks.';

-- ============================================================
-- 8. RLS (house style: authenticated users manage all)
-- ============================================================
ALTER TABLE fuel_transaction_tank_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanned_documents              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage tank readings" ON fuel_transaction_tank_readings;
CREATE POLICY "Authenticated users can manage tank readings"
  ON fuel_transaction_tank_readings FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage scanned documents" ON scanned_documents;
CREATE POLICY "Authenticated users can manage scanned documents"
  ON scanned_documents FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- NOT done here (documented follow-ups — see the design doc):
--   * No backfill synthesizing fuel_transaction rows for already-billed
--     truck_meter_readings: existing lines keep truck_meter_reading_id and
--     remain valid; new billing writes fuel_transaction_id.
--   * No OCR route for invoice slips yet (second document layout) — schema
--     and storage above already accept them.
--   * AI chatbot intake is future-phase only: createTransaction() in
--     frontend/repositories/transactions.repo.ts stays the single clean
--     entry point a chatbot tool-call would use.
--
-- After running, regenerate types:
--   cd frontend && npx supabase gen types typescript --schema public --project-id qkuhvlrdidhumyyxokil > types/database.ts
-- ============================================================
