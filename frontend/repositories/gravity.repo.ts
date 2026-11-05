import type { Database, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  apiGravityToSpecificGravity,
  correctApiGravityTo60,
  densityLbsGalAtTemp
} from '@/lib/gravity-correction'

export type GravityReadingRow = Tables<'fuel_gravity_readings'>

const ACCEPTABLE_TOLERANCE_API = 1.0
const FORMULA_MISMATCH_WARNING_API = 0.3
// Mixed-average window = this many "farm volumes" of recent deliveries. The
// pumps draw from the top rather than recirculating, so one farm volume isn't
// a true turnover; 5x reaches back far enough to include fuel that settled low.
const WINDOW_CAPACITY_MULTIPLIER = 5.0
const FETCH_LIMIT = 200

export interface GravityAverage {
  apiGravity60: number
  specificGravity60: number
  densityLbsGal60: number
  totalGallons: number
  sampleCount: number
}

export interface GravityInput {
  observedTempF: number
  observedApiGravity: number
  wheelApiGravity60: number
  driverApiGravity: number
  driverSpecificGravity: number | null
  gallonsDelivered: number
}

export interface GravitySaveResult {
  acceptable: boolean
  formulaMismatch: boolean
  computedApiGravity60: number
  deltaApi: number
}

/**
 * Gallon-weighted API gravity at 60F of the most recent loads, windowed by
 * volume (not calendar time) so it tracks what is physically still in T2-T7.
 */
export async function getMixedAverage(
  db: SupabaseClient<Database>,
  farmCapacityGallons: number
): Promise<GravityAverage | null> {
  const { data, error } = await db
    .from('fuel_gravity_readings')
    .select('id, wheel_api_gravity_60, gallons_delivered, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(FETCH_LIMIT)
  if (error) throw error
  if (!data || data.length === 0) return null

  const target = farmCapacityGallons * WINDOW_CAPACITY_MULTIPLIER
  const included: typeof data = []
  let cumulative = 0
  // The load that crosses the line is included in full, not pro-rated.
  for (const r of data) {
    included.push(r)
    cumulative += Number(r.gallons_delivered)
    if (cumulative >= target) break
  }

  const totalGallons = included.reduce((s, r) => s + Number(r.gallons_delivered), 0)
  const weighted = included.reduce((s, r) => s + Number(r.wheel_api_gravity_60) * Number(r.gallons_delivered), 0)
  const apiGravity60 = Math.round((weighted / totalGallons) * 100) / 100

  return {
    apiGravity60,
    specificGravity60: apiGravityToSpecificGravity(apiGravity60),
    densityLbsGal60: densityLbsGalAtTemp(apiGravity60, 60),
    totalGallons,
    sampleCount: included.length
  }
}

export async function saveGravityReading(
  db: SupabaseClient<Database>,
  input: GravityInput
): Promise<GravitySaveResult> {
  const computedApiGravity60 = correctApiGravityTo60(input.observedApiGravity, input.observedTempF)
  const deltaApi = Math.abs(input.wheelApiGravity60 - input.driverApiGravity)
  const acceptable = deltaApi <= ACCEPTABLE_TOLERANCE_API
  const formulaMismatch =
    Math.abs(computedApiGravity60 - input.wheelApiGravity60) > FORMULA_MISMATCH_WARNING_API

  const { error } = await db.from('fuel_gravity_readings').insert({
    observed_temp_f: input.observedTempF,
    observed_api_gravity: input.observedApiGravity,
    computed_api_gravity_60: computedApiGravity60,
    wheel_api_gravity_60: input.wheelApiGravity60,
    driver_api_gravity: input.driverApiGravity,
    driver_specific_gravity: input.driverSpecificGravity,
    gallons_delivered: input.gallonsDelivered,
    acceptable,
    recorded_at: new Date().toISOString()
  })
  if (error) throw error

  return { acceptable, formulaMismatch, computedApiGravity60, deltaApi }
}
