import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createAircraft } from '@/repositories/aircraft.repo'
import { createCustomer } from '@/repositories/customers.repo'
import { createEquipment } from '@/repositories/equipment.repo'
import { createFlight } from '@/repositories/flights.repo'
import { createFueler } from '@/repositories/fuelers.repo'
import { createParkingLocation } from '@/repositories/parking.repo'
import { createTank } from '@/repositories/tanks.repo'

let counter = 0
/** Monotonic-ish suffix so parallel-within-a-file fixtures never collide on unique text PKs. */
function unique(prefix: string): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}

type Db = SupabaseClient<Database>

export async function makeUser(
  db: Db,
  overrides: Partial<Database['public']['Tables']['users']['Insert']> = {}
) {
  const { data, error } = await db
    .from('users')
    .insert({
      username: unique('user-'),
      password: 'test-password-hash',
      first_name: 'Test',
      last_name: 'User',
      role: 'line',
      ...overrides,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function makeAircraft(
  db: Db,
  overrides: Partial<Database['public']['Tables']['aircraft']['Insert']> = {}
) {
  return createAircraft(db, {
    tail_number: unique('N').toUpperCase(),
    aircraft_type_icao: 'B738',
    aircraft_type_display: 'Boeing 737-800',
    ...overrides,
  })
}

export async function makeEquipment(
  db: Db,
  overrides: Partial<Database['public']['Tables']['equipment']['Insert']> = {}
) {
  return createEquipment(db, {
    equipment_id: unique('EQ-'),
    equipment_name: 'Test Fuel Truck',
    equipment_type: 'fuel_truck',
    ...overrides,
  })
}

export async function makeParkingLocation(
  db: Db,
  overrides: Partial<Database['public']['Tables']['parking_location']['Insert']> = {}
) {
  return createParkingLocation(db, {
    description: 'Test ramp spot',
    display_order: 1,
    ...overrides,
  })
}

// `training.repo.ts` was removed when the training/compliance module was rebuilt onto
// training_course/training_completion (see repositories/training-courses.repo.ts), but the
// underlying `training` table is still referenced by certifications.repo.ts's `fueler_training`
// join, so this factory inserts directly instead of going through a now-deleted repo function.
export async function makeTraining(
  db: Db,
  overrides: Partial<Database['public']['Tables']['training']['Insert']> = {}
) {
  const { data, error } = await db
    .from('training')
    .insert({
      training_name: unique('Training '),
      validity_period_days: 365,
      ...overrides,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function makeFueler(
  db: Db,
  overrides: Partial<Database['public']['Tables']['fueler']['Insert']> = {}
) {
  const user = await makeUser(db, { is_active_fueler: true })
  return createFueler(db, {
    user_id: user.id,
    fueler_name: unique('Fueler '),
    ...overrides,
  })
}

export async function makeFlight(
  db: Db,
  overrides: Partial<Database['public']['Tables']['flight']['Insert']> = {}
) {
  const [aircraft, creator] = await Promise.all([makeAircraft(db), makeUser(db)])
  return createFlight(db, {
    aircraft_id: aircraft.tail_number,
    departure_time: new Date().toISOString(),
    created_by_id: creator.id,
    ...overrides,
  })
}

export async function makeCustomer(
  db: Db,
  overrides: Partial<Database['public']['Tables']['customer']['Insert']> = {}
) {
  return createCustomer(db, {
    name: unique('Customer '),
    ...overrides,
  })
}

/** Inserts directly: product.repo.ts only exposes findActiveProducts (no create). */
export async function makeProduct(
  db: Db,
  overrides: Partial<Database['public']['Tables']['product']['Insert']> = {}
) {
  const { data, error } = await db
    .from('product')
    .insert({
      name: unique('Product '),
      sku: unique('SKU-'),
      price: 10,
      product_type: 'product',
      is_active: true,
      ...overrides,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function makeTank(
  db: Db,
  overrides: Partial<Database['public']['Tables']['fuel_tank']['Insert']> = {}
) {
  return createTank(db, {
    tank_id: unique('TANK-'),
    tank_name: 'Test Tank',
    fuel_type: 'jet_a',
    capacity_gallons: 10000,
    min_level_inches: 0,
    max_level_inches: 100,
    usable_min_inches: 5,
    usable_max_inches: 95,
    ...overrides,
  })
}
