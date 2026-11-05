'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type GravityInput,
  getMixedAverage,
  saveGravityReading
} from '@/repositories/gravity.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useGravity(farmCapacityGallons: number) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: ['gravity-average', farmCapacityGallons],
    queryFn: () => getMixedAverage(db, farmCapacityGallons),
    enabled: farmCapacityGallons > 0
  })

  const save = useMutation({
    mutationFn: (input: GravityInput) => saveGravityReading(db, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gravity-average'] })
  })

  return { average: query.data ?? null, save: save.mutateAsync, saving: save.isPending }
}
