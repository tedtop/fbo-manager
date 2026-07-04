'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type EquipmentInsert,
  type EquipmentUpdate,
  createEquipment,
  deleteEquipment,
  findAllEquipment,
  updateEquipment
} from '@/repositories/equipment.repo'
import {
  type EquipmentDomain,
  toEquipmentDomain
} from '@/types/domain/equipment'
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
    mutationFn: ({
      id,
      updates,
      expectedModifiedAt
    }: {
      id: number
      updates: EquipmentUpdate
      expectedModifiedAt?: string
    }) => updateEquipment(db, id, updates, expectedModifiedAt),
    onMutate: async ({ id, updates }) => {
      await qc.cancelQueries({ queryKey: equipmentKeys.lists() })
      const prev = qc.getQueryData<EquipmentDomain[]>(equipmentKeys.lists())
      qc.setQueryData<EquipmentDomain[]>(
        equipmentKeys.lists(),
        (old) => old?.map((e) => (e.id === id ? { ...e, ...updates } : e)) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(equipmentKeys.lists(), ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: equipmentKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEquipment(db, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all })
  })

  return {
    equipment: query.data ?? ([] as EquipmentDomain[]),
    loading: query.isLoading,
    error: query.error,
    createEquipment: (equipment: EquipmentInsert) =>
      createMutation.mutateAsync(equipment),
    updateEquipment: (
      id: number,
      updates: EquipmentUpdate,
      expectedModifiedAt?: string
    ) => updateMutation.mutateAsync({ id, updates, expectedModifiedAt }),
    deleteEquipment: (id: number) => deleteMutation.mutateAsync(id),
    refetch: query.refetch
  }
}
