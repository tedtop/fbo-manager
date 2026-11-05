'use client'

import { createClient } from '@/lib/supabase/client'
import { JET_A_TREND_TANKS } from '@/lib/fuel-farm'
import { findTankHistory } from '@/repositories/tank-readings.repo'
import { useQuery } from '@tanstack/react-query'

export function useJetAHistory(days: number) {
  const db = createClient()

  const query = useQuery({
    queryKey: ['jet-a-history', days],
    queryFn: () => findTankHistory(db, JET_A_TREND_TANKS, days),
    refetchInterval: 10 * 60 * 1000
  })

  return { history: query.data ?? null, loading: query.isLoading }
}
