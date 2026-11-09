import type { SupabaseClient } from '@supabase/supabase-js'

// Hydrometer reading (fuel temperature + density), shared by everyone through the database. Minuteman's
// Fuel Dispatch page uses the latest one as the density fallback when no gravity QC loads are on file.
// fuel_density_readings is a live table written by Minuteman and absent from the generated types.
export interface FuelDensityReading {
  temperatureF: number
  densityLbsGal: number
}

export const DEFAULT_DENSITY_READING: FuelDensityReading = { temperatureF: 50, densityLbsGal: 6.79 }

export async function getLatestDensityReading(db: SupabaseClient<any>): Promise<FuelDensityReading | null> {
  const { data, error } = await db
    .from('fuel_density_readings')
    .select('temperature_f, density_lbs_gal, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { temperatureF: Number(data.temperature_f), densityLbsGal: Number(data.density_lbs_gal) } : null
}

export async function saveDensityReading(db: SupabaseClient<any>, reading: FuelDensityReading): Promise<void> {
  const { error } = await db.from('fuel_density_readings').insert({
    temperature_f: reading.temperatureF,
    density_lbs_gal: reading.densityLbsGal,
    recorded_at: new Date().toISOString()
  })
  if (error) throw error
}
