'use client'

import { createClient } from '@/lib/supabase/client'
import {
  clearLevelOverride,
  findLevelOverride,
  findLowestMeasured,
  setLevelOverride
} from '@/repositories/tank-level-override.repo'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Measured lowest level + manual override for one tank, loaded while the Edit Tank sheet is open. */
export function useTankLowestLevel(tankId: string | null, enabled: boolean) {
  const qc = useQueryClient()
  const key = ['tank-lowest-level', tankId] as const

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!tankId,
    queryFn: async () => {
      const db = createClient()
      const [measured, override] = await Promise.all([
        findLowestMeasured(db, tankId as string),
        findLevelOverride(db, tankId as string)
      ])
      return { measured, override }
    }
  })

  /** null clears the override. */
  const saveOverride = async (inches: number | null) => {
    if (!tankId) return
    const db = createClient()
    if (inches == null) await clearLevelOverride(db, tankId)
    else await setLevelOverride(db, tankId, inches)
    await qc.invalidateQueries({ queryKey: key })
  }

  return {
    measured: query.data?.measured ?? null,
    override: query.data?.override ?? null,
    loading: query.isLoading,
    saveOverride
  }
}
