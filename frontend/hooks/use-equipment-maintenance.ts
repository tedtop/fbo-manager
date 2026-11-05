'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type MaintenanceItemInsert,
  type MaintenanceItemUpdate,
  countOpenMaintenanceItems,
  createMaintenanceItem,
  deleteMaintenanceItem,
  findMaintenanceItems,
  reopenMaintenanceItem,
  resolveMaintenanceItem,
  updateMaintenanceItem,
} from '@/repositories/equipment-maintenance.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const maintenanceKeys = {
  all: ['equipment-maintenance'] as const,
  forEquipment: (equipmentId: number) => [...maintenanceKeys.all, 'equipment', equipmentId] as const,
  openCounts: () => [...maintenanceKeys.all, 'open-counts'] as const,
}

/** Open maintenance item count per equipment id (the badge on the equipment list). */
export function useOpenMaintenanceCounts() {
  const db = createClient()
  return useQuery({
    queryKey: maintenanceKeys.openCounts(),
    queryFn: () => countOpenMaintenanceItems(db),
  })
}

export function useMaintenanceItems(equipmentId: number) {
  const qc = useQueryClient()
  const db = createClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: maintenanceKeys.all })

  const query = useQuery({
    queryKey: maintenanceKeys.forEquipment(equipmentId),
    queryFn: () => findMaintenanceItems(db, equipmentId),
    enabled: Number.isFinite(equipmentId),
  })

  const create = useMutation({
    mutationFn: (item: MaintenanceItemInsert) => createMaintenanceItem(db, item),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: MaintenanceItemUpdate }) =>
      updateMaintenanceItem(db, id, updates),
    onSuccess: invalidate,
  })
  const resolve = useMutation({
    mutationFn: ({ id, ...opts }: { id: number; resolutionNotes?: string; resolvedAt?: string; resolvedBy?: number | null }) =>
      resolveMaintenanceItem(db, id, opts),
    onSuccess: invalidate,
  })
  const reopen = useMutation({
    mutationFn: (id: number) => reopenMaintenanceItem(db, id),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteMaintenanceItem(db, id),
    onSuccess: invalidate,
  })

  return {
    items: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    update: update.mutateAsync,
    resolve: resolve.mutateAsync,
    reopen: reopen.mutateAsync,
    remove: remove.mutateAsync,
  }
}
