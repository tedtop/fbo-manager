-- Truck Sheets / Fuel Truck Meter Readings
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor).
-- These tables are Supabase-native (not Django-managed).
--
-- Data model:
--   equipment            ← fuel trucks live in the existing equipment registry
--   truck_sheets         ← one record per truck per day (the paper sheet header)
--   truck_meter_readings ← one record per row on the sheet (each meter reading)

-- ============================================================
-- 1. Seed the fuel truck fleet into the equipment registry
--    (equipment is Django-managed; all NOT NULL text columns
--    must be supplied explicitly)
-- ============================================================
INSERT INTO equipment
  (equipment_id, equipment_name, equipment_type, manufacturer, model,
   serial_number, status, location, notes, created_at, modified_at)
VALUES
  ('5282', 'Fuel Truck 5282 (Jet A, 5,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8178', 'Fuel Truck 8178 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8370', 'Fuel Truck 8370 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8628', 'Fuel Truck 8628 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('5183', 'Fuel Truck 5183 (Avgas, 750 gal)',   'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 750 gal. Front meter only.', NOW(), NOW()),
  ('8338', 'Fuel Truck 8338 (Avgas, 2,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 2000 gal. Front meter only.', NOW(), NOW())
ON CONFLICT (equipment_id) DO NOTHING;

-- ============================================================
-- 2. TRUCK SHEETS: one record per truck per day.
--    Multi-page days (e.g. a busy Jet A truck) are merged into
--    a single sheet; page_count records how many photos fed it.
-- ============================================================
CREATE TABLE IF NOT EXISTS truck_sheets (
  id                BIGSERIAL PRIMARY KEY,
  sheet_date        DATE   NOT NULL,
  fuel_truck_id     BIGINT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  truck_number      TEXT   NOT NULL,  -- denormalized equipment_id, e.g. '5282'
  fuel_type         TEXT   NOT NULL CHECK (fuel_type IN ('jet_a', 'avgas')),
  gallons_down      NUMERIC(10,2),    -- "Gallons Down" header box
  starting_gallons  NUMERIC(10,2),    -- gallons on the truck at start of sheet
  front_meter_start NUMERIC(12,1),    -- "Front meter starting number"
  rear_meter_start  NUMERIC(12,1),    -- "Rear meter starting number" (NULL on avgas trucks)
  fueler_initials   TEXT,             -- "Init" header box
  page_count        INTEGER NOT NULL DEFAULT 1,
  ocr_raw           JSONB,            -- raw Claude extraction(s), for audit
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fuel_truck_id, sheet_date)
);

-- ============================================================
-- 3. TRUCK METER READINGS: one per handwritten row.
--    reading_type:
--      fueling      – fuel dispensed into an aircraft (incl. "T/O" top-offs)
--      tank_fill    – truck refilled from a farm tank (T1–T5 rows, "Fill")
--      transfer_in  – fuel received from another truck ("Xfer from 8370")
--      transfer_out – fuel pushed to another truck ("Xfer to 5282")
--      other        – anything that doesn't fit above
-- ============================================================
CREATE TABLE IF NOT EXISTS truck_meter_readings (
  id                  BIGSERIAL PRIMARY KEY,
  truck_sheet_id      BIGINT  NOT NULL REFERENCES truck_sheets(id) ON DELETE CASCADE,
  line_number         INTEGER NOT NULL,   -- row order on the sheet (across pages)
  reading_type        TEXT    NOT NULL DEFAULT 'fueling'
    CHECK (reading_type IN ('fueling', 'tank_fill', 'transfer_in', 'transfer_out', 'other')),

  -- Customer information
  customer            TEXT,     -- e.g. 'UA 636', 'MAI', 'Leading Edge'
  tail_number         TEXT,     -- N-number; T1–T5 tank id on tank_fill rows; truck # on transfers
  aircraft_type       TEXT,     -- e.g. 'E175', 'B737', '182', 'A320'
  fuel_type_confirmed BOOLEAN NOT NULL DEFAULT FALSE,  -- the circled "YES" column

  -- Meter register readings (mechanical registers; tenths digit is the
  -- small trailing digit on the register)
  meter               TEXT CHECK (meter IN ('front', 'rear')),
  meter_start         NUMERIC(12,1),
  meter_end           NUMERIC(12,1),

  -- Quantities
  gallons_pumped      NUMERIC(10,2),   -- as written; should equal meter_end - meter_start
  gallons_remaining   NUMERIC(10,2),   -- running truck inventory after this row

  -- Fuel order details
  req_gals_or_lbs     TEXT,            -- requested amount: 'T/O', 'Fill', '1249', '2700 lbs'
  prist               BOOLEAN,         -- Prist additive (Jet A only; NULL on avgas)

  -- Personnel & paperwork
  line_tech_initials  TEXT,
  invoice_number      TEXT,            -- e.g. '21475', '26-3241'
  service_time        TEXT,            -- 'HH:MM' as written, e.g. '0545'

  -- Cross-references
  flight_id           BIGINT REFERENCES flight(id) ON DELETE SET NULL,

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_truck_sheets_date          ON truck_sheets(sheet_date DESC);
CREATE INDEX IF NOT EXISTS idx_truck_sheets_truck         ON truck_sheets(fuel_truck_id, sheet_date DESC);
CREATE INDEX IF NOT EXISTS idx_truck_meter_readings_sheet ON truck_meter_readings(truck_sheet_id, line_number);
CREATE INDEX IF NOT EXISTS idx_truck_meter_readings_tail  ON truck_meter_readings(tail_number) WHERE tail_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_truck_meter_readings_invoice ON truck_meter_readings(invoice_number) WHERE invoice_number IS NOT NULL;

-- ============================================================
-- 5. RLS (matches house style: authenticated users manage all)
-- ============================================================
ALTER TABLE truck_sheets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_meter_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage truck sheets"
  ON truck_sheets FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage truck meter readings"
  ON truck_meter_readings FOR ALL
  USING (auth.role() = 'authenticated');
