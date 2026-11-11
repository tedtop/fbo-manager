import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert } from '@/types/database'
import { lowestReading, type MeasuredLow } from '@/lib/fuel-farm'

export type TankReadingRow = Tables<'tank_level_readings'>
export type TankReadingInsert = TablesInsert<'tank_level_readings'>

export async function findReadingsByTankId(
  db: SupabaseClient<Database>,
  tankId: string,
  days = 7
): Promise<TankReadingRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await db
    .from('tank_level_readings')
    .select('*')
    .eq('tank_id', tankId)
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function findReadingsByTankIds(
  db: SupabaseClient<Database>,
  tankIds: string[],
  days: number  // 0 = all history
): Promise<TankReadingRow[]> {
  let q = db
    .from('tank_level_readings')
    .select('*')
    .in('tank_id', tankIds)
    .order('recorded_at', { ascending: true })

  if (days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    q = q.gte('recorded_at', since.toISOString())
  }

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createTankReading(
  db: SupabaseClient<Database>,
  reading: TankReadingInsert
): Promise<TankReadingRow> {
  const { data, error } = await db
    .from('tank_level_readings')
    .insert(reading)
    .select()
    .single()
  if (error) throw error

  // Keep the lowest-ever-level cache (shared with the Minuteman dashboard) in
  // sync. The RPC only overwrites when this is a new low. Not fatal: the reading
  // itself is already recorded.
  const { error: minError } = await db.rpc('update_tank_level_min', {
    p_tank_id: reading.tank_id,
    p_level: Number(reading.level),
    p_recorded_at: reading.recorded_at
  })
  if (minError) console.error('Failed to update tank_level_min cache:', minError)

  return data
}

export interface JetAHistory {
  /** ISO start of the range, or null for "all". */
  since: string | null
  /** Latest level before `since` per tank, so the trend starts from a real total. */
  baseline: Record<string, number>
  readings: { tankId: string; level: number; recordedAt: string }[]
}

/** Readings for the given tanks since `days` ago (0 = all), plus the per-tank baseline before that. */
export async function findTankHistory(
  db: SupabaseClient<Database>,
  tankIds: string[],
  days: number
): Promise<JetAHistory> {
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null

  const baselinePromise =
    since === null
      ? Promise.resolve([] as { tankId: string; level: number }[])
      : Promise.all(
          tankIds.map(async (tankId) => {
            const { data } = await db
              .from('tank_level_readings')
              .select('level')
              .eq('tank_id', tankId)
              .lt('recorded_at', since)
              .order('recorded_at', { ascending: false })
              .limit(1)
            return data && data.length ? { tankId, level: Number(data[0].level) } : null
          })
        ).then((rows) => rows.filter((r): r is { tankId: string; level: number } => r !== null))

  // PostgREST caps responses (1000 rows); page through so the newest readings
  // aren't silently dropped on long ranges.
  const PAGE_SIZE = 1000
  const readings: JetAHistory['readings'] = []
  for (let page = 0; ; page++) {
    let q = db
      .from('tank_level_readings')
      .select('tank_id, level, recorded_at')
      .in('tank_id', tankIds)
      .order('recorded_at', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (since !== null) q = q.gte('recorded_at', since)
    const { data, error } = await q
    if (error) throw error
    readings.push(...data.map((r) => ({ tankId: r.tank_id, level: Number(r.level), recordedAt: r.recorded_at })))
    if (data.length < PAGE_SIZE) break
  }

  const baseline: Record<string, number> = {}
  for (const b of await baselinePromise) baseline[b.tankId] = b.level

  return { since, baseline, readings }
}

/** Lowest reading ever saved for a tank (level + date), or null with no readings. Read only. */
export async function findLowestMeasured(
  db: SupabaseClient<Database>,
  tankId: string
): Promise<MeasuredLow | null> {
  const { data, error } = await db
    .from('tank_level_readings')
    .select('level, recorded_at')
    .eq('tank_id', tankId)
    .order('level', { ascending: true })
    .order('recorded_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return lowestReading((data ?? []).map((r) => ({ level: r.level, recordedAt: r.recorded_at })))
}
