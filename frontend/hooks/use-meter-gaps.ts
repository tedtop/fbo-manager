'use client'

import { createClient } from '@/lib/supabase/client'
import { detectGaps } from '@/lib/meter-gaps'
import { findAnnotationsForTruck, saveGapAnnotation, type AnnotationInput } from '@/repositories/meter-gaps.repo'
import { findTruckSheetsForEquipment } from '@/repositories/truck-sheets.repo'
import { findSavedAirlineFueling, saveAirlineFueling, type AirlineFuelingInput } from '@/services/airline-fueling.service'
import { truckSheetKeys } from '@/hooks/use-truck-sheets'
import type { MeterGap } from '@/lib/meter-gaps'
import type { MeterGapAnnotationRow } from '@/repositories/meter-gaps.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** How many of a truck's newest sheets the chain is built from (a year of daily sheets). */
const CHAIN_SHEETS = 400

export const meterGapKeys = {
  all: ['meter-gaps'] as const,
  truck: (equipmentId: number, excludeTransactionId?: number) => [...meterGapKeys.all, 'truck', equipmentId, excludeTransactionId ?? null] as const,
  annotations: (equipmentId: number) => [...meterGapKeys.all, 'annotations', equipmentId] as const,
  saved: (qtDispatchId: string) => [...meterGapKeys.all, 'saved', qtDispatchId] as const
}

/**
 * Gaps and last meter ends of one fuel truck, computed from its stored readings (scans and typed entries alike).
 * `excludeTransactionId` leaves out the readings of one saved fueling, so the Fuel sheet can compare the start it
 * shows with where the truck ended before that fueling.
 */
export function useTruckMeterGaps(equipmentId: number | undefined, excludeTransactionId?: number) {
  const db = createClient()
  return useQuery({
    queryKey: meterGapKeys.truck(equipmentId ?? 0, excludeTransactionId),
    enabled: equipmentId != null,
    queryFn: async () => {
      const sheets = await findTruckSheetsForEquipment(db, equipmentId as number, CHAIN_SHEETS)
      if (excludeTransactionId == null) return detectGaps(sheets)
      return detectGaps(sheets.map((s) => ({ ...s, readings: s.readings.filter((r) => r.fuel_transaction_id !== excludeTransactionId) })))
    }
  })
}

export function useGapAnnotations(equipmentId: number | undefined) {
  const db = createClient()
  return useQuery({
    queryKey: meterGapKeys.annotations(equipmentId ?? 0),
    enabled: equipmentId != null,
    queryFn: () => findAnnotationsForTruck(db, equipmentId as number)
  })
}

export function useSaveGapAnnotation(equipmentId: number) {
  const db = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { gap: MeterGap; input: AnnotationInput; existing?: MeterGapAnnotationRow }) =>
      saveGapAnnotation(db, equipmentId, v.gap, v.input, v.existing),
    onSuccess: () => qc.invalidateQueries({ queryKey: meterGapKeys.annotations(equipmentId) })
  })
}

export function useSavedAirlineFueling(qtDispatchId: string | undefined, enabled: boolean) {
  const db = createClient()
  return useQuery({
    queryKey: meterGapKeys.saved(qtDispatchId ?? ''),
    enabled: enabled && !!qtDispatchId,
    queryFn: () => findSavedAirlineFueling(db, qtDispatchId as string)
  })
}

export function useSaveAirlineFueling() {
  const db = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AirlineFuelingInput) => saveAirlineFueling(db, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meterGapKeys.all })
      qc.invalidateQueries({ queryKey: truckSheetKeys.all })
    }
  })
}
