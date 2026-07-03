'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { equipmentKeys } from './use-equipment'

export function useEquipmentRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const db = createClient()
    const channel = db
      .channel('equipment-status-board')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment' },
        () => {
          qc.invalidateQueries({ queryKey: equipmentKeys.all })
        }
      )
      .subscribe()

    return () => {
      db.removeChannel(channel)
    }
  }, [qc])
}
