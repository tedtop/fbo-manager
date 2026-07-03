-- Fuel Orders Schema Migration
-- Run in Supabase SQL Editor (supabase.com/dashboard → SQL Editor)
--
-- Adds:
--   1. Fuel truck equipment records (seed data)
--   2. fuel_truck_id, tail_number, fuel_type, source, ordered_by_id to fuel_transaction
--   3. fueled_at to flight
-- ============================================================

-- 1. Seed fuel trucks into equipment registry
INSERT INTO equipment
  (equipment_id, equipment_name, equipment_type, manufacturer, model,
   serial_number, status, location, notes, created_at, modified_at)
VALUES
  ('5282', 'Fuel Truck 5282 (Jet A, 5,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8178', 'Fuel Truck 8178 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8370', 'Fuel Truck 8370 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('8628', 'Fuel Truck 8628 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', NOW(), NOW()),
  ('5183', 'Fuel Truck 5183 (Avgas, 750 gal)',  'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 750 gal. Front meter only.', NOW(), NOW()),
  ('8338', 'Fuel Truck 8338 (Avgas, 2,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 2000 gal. Front meter only.', NOW(), NOW())
ON CONFLICT (equipment_id) DO NOTHING;

-- 2. Add columns to fuel_transaction for internal fuel orders
ALTER TABLE fuel_transaction
  ADD COLUMN IF NOT EXISTS fuel_truck_id    BIGINT REFERENCES equipment(id),
  ADD COLUMN IF NOT EXISTS tail_number      TEXT,
  ADD COLUMN IF NOT EXISTS fuel_type        TEXT,
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('qt', 'flight_card', 'manual')),
  ADD COLUMN IF NOT EXISTS ordered_by_id    BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS fuel_order_text  TEXT;

-- Drop old fuel_type check and recreate with jet_a_plus
ALTER TABLE fuel_transaction DROP CONSTRAINT IF EXISTS fuel_transaction_fuel_type_check;
ALTER TABLE fuel_transaction ADD CONSTRAINT fuel_transaction_fuel_type_check
  CHECK (fuel_type IS NULL OR fuel_type IN ('jet_a', 'jet_a_plus', 'avgas'));

-- 3. Add fueled_at timestamp to flight
ALTER TABLE flight ADD COLUMN IF NOT EXISTS fueled_at TIMESTAMPTZ;

-- ============================================================
-- After running, regenerate types:
--   cd frontend && npx supabase gen types typescript --schema public --project-id qkuhvlrdidhumyyxokil > types/database.ts
-- ============================================================
