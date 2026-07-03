'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type TankInsert,
  type TankUpdate,
  type TankWithLatestReading,
  createTank,
  deleteTank,
  findAllTanks,
  updateTank
} from '@/repositories/tanks.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const tankKeys = {
  all: ['tanks'] as const,
  lists: () => [...tankKeys.all, 'list'] as const
}

export function useTanks() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: tankKeys.lists(),
    queryFn: () => findAllTanks(db)
  })

  const createMutation = useMutation({
    mutationFn: (tank: TankInsert) => createTank(db, tank),
    onSuccess: () => qc.invalidateQueries({ queryKey: tankKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({
      tankId,
      updates,
      expectedModifiedAt
    }: {
      tankId: string
      updates: TankUpdate
      expectedModifiedAt?: string
    }) => updateTank(db, tankId, updates, expectedModifiedAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: tankKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (tankId: string) => deleteTank(db, tankId),
    onSuccess: () => qc.invalidateQueries({ queryKey: tankKeys.all })
  })

  return {
    tanks: query.data ?? ([] as TankWithLatestReading[]),
    loading: query.isLoading,
    error: query.error,
    createTank: (tank: TankInsert) => createMutation.mutateAsync(tank),
    updateTank: (
      tankId: string,
      updates: TankUpdate,
      expectedModifiedAt?: string
    ) => updateMutation.mutateAsync({ tankId, updates, expectedModifiedAt }),
    deleteTank: (tankId: string) => deleteMutation.mutateAsync(tankId),
    refetch: query.refetch
  }
}
