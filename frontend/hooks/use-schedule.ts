'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  findShiftsByRange,
  createShift as createShiftRepo,
  updateShift as updateShiftRepo,
  deleteShift as deleteShiftRepo,
  type ScheduleShiftInsert,
  type ScheduleShiftUpdate,
} from '@/repositories/schedule.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const scheduleKeys = {
  all: ['schedule'] as const,
  range: (deptId: number, start: string, end: string) =>
    [...scheduleKeys.all, deptId, start, end] as const,
}

/**
 * Shifts for a department in [startDate, endDate], live-updated via
 * Supabase realtime so schedule changes from teammates appear immediately.
 */
export function useSchedule(
  departmentId: number | null,
  startDate: string,
  endDate: string
) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: scheduleKeys.range(departmentId ?? -1, startDate, endDate),
    queryFn: () => findShiftsByRange(db, departmentId!, startDate, endDate),
    enabled: departmentId !== null && !!startDate && !!endDate,
  })

  useEffect(() => {
    if (departmentId === null) return
    const channel = db
      .channel(`schedule-shift-${departmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_shift',
          filter: `department_id=eq.${departmentId}`,
        },
        () => qc.invalidateQueries({ queryKey: scheduleKeys.all })
      )
      .subscribe()
    return () => {
      db.removeChannel(channel)
    }
  }, [db, qc, departmentId])

  const invalidate = () => qc.invalidateQueries({ queryKey: scheduleKeys.all })

  const createMutation = useMutation({
    mutationFn: (shift: ScheduleShiftInsert) => createShiftRepo(db, shift),
    onSuccess: invalidate,
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: ScheduleShiftUpdate }) =>
      updateShiftRepo(db, id, updates),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteShiftRepo(db, id),
    onSuccess: invalidate,
  })

  return {
    shifts: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createShift: (shift: ScheduleShiftInsert) => createMutation.mutateAsync(shift),
    updateShift: (id: number, updates: ScheduleShiftUpdate) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteShift: (id: number) => deleteMutation.mutateAsync(id),
    mutating:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  }
}
