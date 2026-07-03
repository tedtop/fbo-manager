'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type EquipmentRow,
  findAllEquipment
} from '@/repositories/equipment.repo'
import { useQuery } from '@tanstack/react-query'

export const fuelTruckKeys = {
  all: ['fuel-trucks'] as const
}

/** Fuel trucks live in the equipment registry (equipment_type = 'fuel_truck'). */
export function useFuelTrucks() {
  const db = createClient()

  const query = useQuery({
    queryKey: fuelTruckKeys.all,
    queryFn: async (): Promise<EquipmentRow[]> => {
      const rows = await findAllEquipment(db)
      return rows.filter((row) => row.equipment_type === 'fuel_truck')
    }
  })

  return {
    trucks: query.data ?? [],
    loading: query.isLoading,
    error: query.error
  }
}
