'use client'

import { inchesToGallons } from '@/lib/gallons-tables'
import { createClient } from '@/lib/supabase/client'
import { findReadingsByTankIds } from '@/repositories/tank-readings.repo'
import { useQuery } from '@tanstack/react-query'

const JET_A_TREND_TANK_IDS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export interface JetATrendPoint {
  date: string
  gallons: number
}

function aggregateDailyTotals(
  readings: { tank_id: string; level: string; recorded_at: string }[]
): JetATrendPoint[] {
  const byDay: Record<string, Record<string, number>> = {}

  for (const r of readings) {
    const day = r.recorded_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = {}
    byDay[day][r.tank_id] = Number.parseFloat(r.level)
  }

  const tankState: Record<string, number> = {}

  return Object.keys(byDay)
    .sort()
    .map((day) => {
      Object.assign(tankState, byDay[day])
      const gallons = JET_A_TREND_TANK_IDS.reduce((sum, id) => {
        return sum + inchesToGallons(id, tankState[id] ?? 0)
      }, 0)
      return { date: day, gallons } // date is ISO "YYYY-MM-DD" for tooltip formatting
    })
}

export function useJetAHistory(days: number) {
  const db = createClient()

  const query = useQuery({
    queryKey: ['jet-a-history', days],
    queryFn: async () => {
      const readings = await findReadingsByTankIds(
        db,
        JET_A_TREND_TANK_IDS,
        days
      )
      return aggregateDailyTotals(readings)
    }
  })

  return {
    data: query.data ?? [],
    loading: query.isLoading
  }
}
