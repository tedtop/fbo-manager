'use client'

import { createClient } from '@/lib/supabase/client'
import {
  createTraining,
  deleteTraining,
  findAllTrainings,
  updateTraining,
  type TrainingInsert,
  type TrainingRow,
  type TrainingUpdate
} from '@/repositories/trainings.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const trainingKeys = {
  all: ['trainings'] as const,
  lists: () => [...trainingKeys.all, 'list'] as const
}

export function useTrainings() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: trainingKeys.lists(),
    queryFn: () => findAllTrainings(db)
  })

  const createMutation = useMutation({
    mutationFn: (training: TrainingInsert) => createTraining(db, training),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: TrainingUpdate }) =>
      updateTraining(db, id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTraining(db, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.all })
  })

  return {
    trainings: query.data ?? [] as TrainingRow[],
    loading: query.isLoading,
    error: query.error,
    createTraining: (training: TrainingInsert) => createMutation.mutateAsync(training),
    updateTraining: (id: number, updates: TrainingUpdate) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteTraining: (id: number) => deleteMutation.mutateAsync(id),
    refetch: query.refetch
  }
}
