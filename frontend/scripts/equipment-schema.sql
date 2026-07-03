-- Equipment Registry
-- Run this in the Supabase SQL Editor (supabase.com/dashboard -> SQL Editor)
-- or via psql against the pooler connection in frontend/.env.local.
--
-- This table is Supabase-native (not Django-managed) — the app was decoupled
-- from Django to talk to Supabase directly. Column shapes mirror the retired
-- Django model (backend/api/models.py, class Equipment) so existing
-- expectations (id BIGSERIAL PK, equipment_id TEXT UNIQUE, ...) still hold.
--
-- equipment_type started as: fuel_truck, tug, gpu, air_start, belt_loader,
-- stairs, lavatory_service, water_service, other. Two types were added here
-- to cover the fleet's staff/ops vehicles and light transport:
--   golf_cart      - ramp golf carts
--   staff_vehicle  - cars/SUVs used for staff & ops (e.g. sedans, Suburbans)

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment (
  id                     BIGSERIAL PRIMARY KEY,
  equipment_id           TEXT NOT NULL UNIQUE,
  equipment_name         TEXT NOT NULL,
  equipment_type         TEXT NOT NULL CHECK (equipment_type IN (
                             'fuel_truck', 'tug', 'gpu', 'air_start', 'belt_loader',
                             'stairs', 'lavatory_service', 'water_service',
                             'golf_cart', 'staff_vehicle', 'other'
                           )),
  manufacturer           TEXT NOT NULL DEFAULT '',
  model                  TEXT NOT NULL DEFAULT '',
  serial_number          TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
                             'available', 'in_use', 'maintenance', 'out_of_service'
                           )),
  location               TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  last_maintenance_date  DATE,
  next_maintenance_date  DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_type   ON equipment(equipment_type);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);

-- ============================================================
-- 2. Seed the fleet
--    Fuel truck IDs match frontend/scripts/truck-sheets-schema.sql's own
--    seed exactly (ON CONFLICT DO NOTHING keeps both scripts idempotent
--    and safe to run in either order).
-- ============================================================
INSERT INTO equipment
  (equipment_id, equipment_name, equipment_type, manufacturer, model,
   serial_number, status, location, notes, created_at, modified_at)
VALUES
  -- Aviation fuel trucks (Jet A / Avgas) — feed the truck-sheets workflow
  ('5282', 'Fuel Truck 5282 (Jet A, 5,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8178', 'Fuel Truck 8178 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8370', 'Fuel Truck 8370 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8628', 'Fuel Truck 8628 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('5183', 'Fuel Truck 5183 (Avgas, 750 gal)',   'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 750 gal. Front meter only.', NOW(), NOW()),
  ('8338', 'Fuel Truck 8338 (Avgas, 2,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 2000 gal. Front meter only.', NOW(), NOW()),

  -- Ground-service fuel truck (diesel/gasoline) — NOT an aircraft fuel truck.
  -- Deliberately excluded from the truck-sheets Jet A/Avgas workflow, whose
  -- truck_sheets table CHECKs fuel_type IN ('jet_a', 'avgas').
  ('3183', 'Fuel Truck 3183 (Diesel/Gas, Ground Service)', 'fuel_truck', '', '', '', 'available', '', 'Diesel/gasoline — ground equipment servicing, not aircraft fueling. Not part of the Jet A/Avgas truck-sheets workflow.', NOW(), NOW()),

  -- Golf cart
  ('GC-1', 'Golf Cart 1', 'golf_cart', '', '', '', 'available', '', '', NOW(), NOW()),

  -- Tugs
  ('TUG-1', 'Tug 1', 'tug', '', '', '', 'available', '', '', NOW(), NOW()),
  ('TUG-2', 'Tug 2', 'tug', '', '', '', 'available', '', '', NOW(), NOW()),
  ('TUG-LEKTRO', 'Lektro Tug', 'tug', 'Lektro', '', '', 'available', '', 'Electric aircraft tow tractor.', NOW(), NOW()),

  -- Staff/ops vehicles
  ('VEH-MALIBU', 'Malibu', 'staff_vehicle', 'Chevrolet', 'Malibu', '', 'available', '', 'White staff/ops sedan.', NOW(), NOW()),
  ('VEH-SUBURBAN', 'Suburban', 'staff_vehicle', 'Chevrolet', 'Suburban', '', 'available', '', 'Purple staff/ops SUV.', NOW(), NOW())
ON CONFLICT (equipment_id) DO NOTHING;

-- ============================================================
-- 3. RLS (matches house style: authenticated users manage all)
-- ============================================================
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage equipment"
  ON equipment FOR ALL
  USING (auth.role() = 'authenticated');
