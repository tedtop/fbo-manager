'use client'

import { createClient } from '@/lib/supabase/client'
import { findReadingsByTankId } from '@/repositories/tank-readings.repo'
import { useQuery } from '@tanstack/react-query'

export const tankReadingKeys = {
  all: ['tank-readings'] as const,
  byTank: (tankId: string, days: number) =>
    [...tankReadingKeys.all, tankId, days] as const
}

export function useTankReadings(tankId: string, days = 7) {
  const db = createClient()

  const query = useQuery({
    queryKey: tankReadingKeys.byTank(tankId, days),
    queryFn: () => findReadingsByTankId(db, tankId, days),
    enabled: !!tankId
  })

  return {
    readings: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
