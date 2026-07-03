'use client'

import { createClient } from '@/lib/supabase/client'
import { findAllEquipment } from '@/repositories/equipment.repo'
import {
  findAllTruckSheets,
  findTruckSheetById,
  deleteTruckSheet,
} from '@/repositories/truck-sheets.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const truckSheetKeys = {
  all: ['truck-sheets'] as const,
  lists: () => [...truckSheetKeys.all, 'list'] as const,
  detail: (id: number) => [...truckSheetKeys.all, 'detail', id] as const,
}

export function useFuelTrucks() {
  const db = createClient()
  return useQuery({
    queryKey: ['equipment', 'fuel-trucks'],
    queryFn: async () => {
      const equipment = await findAllEquipment(db)
      return equipment.filter((e) => e.equipment_type === 'fuel_truck')
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useTruckSheets() {
  const db = createClient()
  return useQuery({
    queryKey: truckSheetKeys.lists(),
    queryFn: () => findAllTruckSheets(db),
  })
}

export function useTruckSheet(id: number) {
  const db = createClient()
  return useQuery({
    queryKey: truckSheetKeys.detail(id),
    queryFn: () => findTruckSheetById(db, id),
    enabled: Number.isFinite(id),
  })
}

export function useDeleteTruckSheet() {
  const db = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteTruckSheet(db, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: truckSheetKeys.all })
    },
  })
}
