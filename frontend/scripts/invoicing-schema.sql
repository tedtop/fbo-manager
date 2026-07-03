-- Invoicing / Fuel Tickets
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor).
-- These tables are Supabase-native (not Django-managed).
--
-- DEPENDS ON: scripts/truck-sheets-schema.sql (truck_sheets, truck_meter_readings).
-- Run that script first. A fueling event lives in truck_meter_readings — whether
-- it got there via OCR import of a paper truck sheet or via digital ticket entry
-- in the invoicing module. An invoice fuel line REFERENCES that event
-- (invoice_line_items.truck_meter_reading_id); it never duplicates it.
--
-- Also references the existing Django-managed tables: customer, product, flight.
--
-- Data model:
--   invoices              ← one per paper fuel ticket / counter sale (the document)
--   invoice_line_items    ← fuel, service, fee, and product lines
--   invoice_fuel_readings ← per-position aircraft gauge readings from the ticket's
--                           DESCRIPTION block, e.g. "3930-L-7950" (left tank gauge
--                           read 3930 lbs before fueling, 7950 lbs after)

-- ============================================================
-- 1. INVOICES: the ticket header.
--    Field names follow the paper Minuteman Aviation ticket:
--    AIRCRAFT NO., AIRCRAFT TYPE, DATE, NAME, ADDRESS, INVOICE #,
--    SALESMAN, payment-method checkboxes.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                 BIGSERIAL PRIMARY KEY,
  invoice_number     TEXT NOT NULL UNIQUE,       -- hand-assigned, e.g. '21475'; not always sequential
  invoice_date       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- draft       – being entered, not yet final
  -- open        – finalized on account (E.O.M. / R.O.A.); awaiting settlement
  -- paid        – settled (immediately for cash/check/card, later for account)
  -- void        – cancelled; kept for the numbering audit trail
  status             TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paid', 'void')),

  -- Customer: NAME on the ticket is written as airline + flight ('UA5996',
  -- 'WA1026') or a person/company. customer_id links a known account
  -- (required for E.O.M./R.O.A.); customer_name preserves what was written.
  customer_id        BIGINT REFERENCES customer(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL,
  station            TEXT,                       -- ADDRESS shorthand: 'MSO w/5282' (station + truck)

  tail_number        TEXT,                       -- AIRCRAFT NO., e.g. 'N37527'
  aircraft_type      TEXT,                       -- e.g. 'B739M', 'E175'
  flight_id          BIGINT REFERENCES flight(id) ON DELETE SET NULL,

  -- Payment-method checkboxes on the ticket. E.O.M. (End of Month) and
  -- R.O.A. (Receipt on Account) bill to the customer's account → status 'open'.
  payment_method     TEXT
    CHECK (payment_method IN ('cash', 'eom', 'roa', 'check', 'credit_card')),
  check_number       TEXT,                       -- CHECK NO. box

  -- Settlement of account invoices (eom/roa) when payment arrives later.
  paid_at            TIMESTAMPTZ,
  settled_via        TEXT
    CHECK (settled_via IN ('cash', 'check', 'credit_card', 'account_credit')),
  settlement_reference TEXT,                     -- check #, card auth, remittance id

  salesman_initials  TEXT,                       -- SALESMAN box (line tech initials)
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. INVOICE LINE ITEMS: fuel + non-fuel lines.
--    A fuel line's fueling event (truck, meter start/stop, gallons)
--    lives in truck_meter_readings; truck_meter_reading_id is the
--    origin link. Price is tax-inclusive per the ticket:
--    "Federal and state tax included in the price per gallon."
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                      BIGSERIAL PRIMARY KEY,
  invoice_id              BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number             INTEGER NOT NULL DEFAULT 1,
  item_type               TEXT NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('fuel', 'service', 'fee', 'product')),

  -- Non-fuel lines may come from the product catalog (Django `product` table).
  product_id              BIGINT REFERENCES product(id) ON DELETE SET NULL,

  -- Fuel lines originate from a fueling event on a truck sheet. Digital ticket
  -- entry creates the truck_meter_readings row itself (find-or-create the
  -- truck's sheet for the day, append a reading); billing an OCR-imported
  -- sheet line links the existing row. Either way the meter data has exactly
  -- one home. UNIQUE below: a fueling event is billed at most once.
  truck_meter_reading_id  BIGINT REFERENCES truck_meter_readings(id) ON DELETE SET NULL,

  description             TEXT NOT NULL,
  quantity                NUMERIC(12,2) NOT NULL DEFAULT 1,   -- gallons for fuel lines
  unit_price              NUMERIC(12,4) NOT NULL DEFAULT 0,   -- PRICE per gallon, tax-inclusive
  amount                  NUMERIC(12,2) NOT NULL DEFAULT 0,   -- AMOUNT = quantity × unit_price

  -- Fuel-line ticket fields (NULL on non-fuel lines)
  fuel_type               TEXT
    CHECK (fuel_type IN ('jet_a', 'avgas_100', 'avgas_80', 'unleaded')),  -- JET / 100 / 80 / UNLEADED boxes
  density                 NUMERIC(4,2),   -- lbs/gal hydrometer figure on Jet A tickets, e.g. 6.81
  requested_amount        TEXT,           -- 'Req: 15800' → '15800' (lbs), or 'T/O'
  service_time            TEXT,           -- 'Time: 0535-0550' → '0535-0550'

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_line_items_meter_reading
  ON invoice_line_items(truck_meter_reading_id)
  WHERE truck_meter_reading_id IS NOT NULL;

-- ============================================================
-- 3. INVOICE FUEL READINGS: per-position aircraft gauge lines
--    from the DESCRIPTION block, format {start}-{position}-{end}:
--      3930-L-7950   left gauge 3930 → 7950 (lbs)
--      4040-R-7950   right gauge 4040 → 7950
--      7970-T-15900  totalizer 7970 → 15900
--    Validation: Σ(L,R,C deltas) = T delta, and T delta (lbs) ÷ density
--    ≈ gallons delivered ≈ truck meter stop − start.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_fuel_readings (
  id             BIGSERIAL PRIMARY KEY,
  line_item_id   BIGINT NOT NULL REFERENCES invoice_line_items(id) ON DELETE CASCADE,
  position       TEXT NOT NULL CHECK (position IN ('left', 'right', 'center', 'total')),
  reading_start  NUMERIC(12,1) NOT NULL,
  reading_end    NUMERIC(12,1) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_date         ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer     ON invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tail         ON invoices(tail_number) WHERE tail_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id, line_number);
CREATE INDEX IF NOT EXISTS idx_invoice_fuel_readings_line ON invoice_fuel_readings(line_item_id);

-- ============================================================
-- 5. RLS (matches house style: authenticated users manage all)
-- ============================================================
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_fuel_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage invoices"
  ON invoices FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage invoice line items"
  ON invoice_line_items FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage invoice fuel readings"
  ON invoice_fuel_readings FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 6. Seed the non-fuel service catalog (Django `product` table)
--    so the quick-pick isn't empty on day one.
-- ============================================================
INSERT INTO product (name, description, sku, price, product_type, is_active, created_at, modified_at)
SELECT v.name, v.description, v.sku, v.price, v.product_type, TRUE, NOW(), NOW()
FROM (VALUES
  ('Overnight Parking (Jet)',    'Per night',      'PARK-JET',  150.00, 'fee'),
  ('Overnight Parking (Single)', 'Per night',      'PARK-SGL',   25.00, 'fee'),
  ('GPU Start',                  'Ground power',   'SVC-GPU',    75.00, 'service'),
  ('Lav Service',                '',               'SVC-LAV',   125.00, 'service'),
  ('Potable Water',              '',               'SVC-H2O',    45.00, 'service'),
  ('De-Ice (Type I)',            'Per application','SVC-DEICE', 250.00, 'service'),
  ('Catering Handling',          '',               'FEE-CATER',  50.00, 'fee'),
  ('Ramp Fee',                   'Waived w/ fuel', 'FEE-RAMP',   75.00, 'fee'),
  ('Prist Additive',             'Per treatment',  'PROD-PRIST', 15.00, 'product'),
  ('Oil (Qt)',                   'Aeroshell W100', 'PROD-OIL',   12.50, 'product')
) AS v(name, description, sku, price, product_type)
WHERE NOT EXISTS (SELECT 1 FROM product p WHERE p.sku = v.sku);
