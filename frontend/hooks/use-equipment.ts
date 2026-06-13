'use client'

import { createClient } from '@/lib/supabase/client'
import {
  createEquipment,
  deleteEquipment,
  findAllEquipment,
  updateEquipment,
  type EquipmentInsert,
  type EquipmentUpdate
} from '@/repositories/equipment.repo'
import { toEquipmentDomain, type EquipmentDomain } from '@/types/domain/equipment'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const equipmentKeys = {
  all: ['equipment'] as const,
  lists: () => [...equipmentKeys.all, 'list'] as const
}

export function useEquipment() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: equipmentKeys.lists(),
    queryFn: async () => {
      const rows = await findAllEquipment(db)
      return rows.map(toEquipmentDomain)
    }
  })

  const createMutation = useMutation({
    mutationFn: (equipment: EquipmentInsert) => createEquipment(db, equipment),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: EquipmentUpdate }) =>
      updateEquipment(db, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEquipment(db, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all })
  })

  return {
    equipment: query.data ?? [] as EquipmentDomain[],
    loading: query.isLoading,
    error: query.error,
    createEquipment: (equipment: EquipmentInsert) => createMutation.mutateAsync(equipment),
    updateEquipment: (id: number, updates: EquipmentUpdate) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteEquipment: (id: number) => deleteMutation.mutateAsync(id),
    refetch: query.refetch
  }
}
