'use client'

import { createClient } from '@/lib/supabase/client'
import {
  findShiftsByDateRange,
  createShift as createShiftRepo,
  updateShift as updateShiftRepo,
  deleteShift as deleteShiftRepo,
  type ShiftInsert,
  type ShiftUpdate,
} from '@/repositories/shifts.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const shiftKeys = {
  all: ['shifts'] as const,
  range: (start: string, end: string) => [...shiftKeys.all, 'range', start, end] as const,
}

export function useShifts(startDate: string, endDate: string) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: shiftKeys.range(startDate, endDate),
    queryFn: () => findShiftsByDateRange(db, startDate, endDate),
    enabled: !!startDate && !!endDate,
  })

  const createMutation = useMutation({
    mutationFn: (shift: ShiftInsert) => createShiftRepo(db, shift),
    onSuccess: () => qc.invalidateQueries({ queryKey: shiftKeys.all }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: ShiftUpdate }) =>
      updateShiftRepo(db, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: shiftKeys.all }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteShiftRepo(db, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: shiftKeys.all }),
  })

  return {
    shifts: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createShift: (shift: ShiftInsert) => createMutation.mutateAsync(shift),
    updateShift: (id: number, updates: ShiftUpdate) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteShift: (id: number) => deleteMutation.mutateAsync(id),
  }
}
