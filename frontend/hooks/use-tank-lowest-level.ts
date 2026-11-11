'use client'

import { createClient } from '@/lib/supabase/client'
import { findLowestMeasured } from '@/repositories/tank-readings.repo'
import { useQuery } from '@tanstack/react-query'

/** Lowest level ever measured for one tank, loaded while the Edit Tank sheet is open. */
export function useTankLowestLevel(tankId: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: ['tank-lowest-level', tankId],
    enabled: enabled && !!tankId,
    queryFn: () => findLowestMeasured(createClient(), tankId as string)
  })
  return { measured: query.data ?? null, loading: query.isLoading }
}
