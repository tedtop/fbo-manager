'use client'

import { createClient } from '@/lib/supabase/client'
import { fetchComplianceMatrix } from '@/repositories/training-admin.repo'
import { createAssignedTraining } from '@/repositories/assigned-training.repo'
import { completeCertification } from '@/services/certifications.service'
import type { CompleteCertificationInput } from '@/services/certifications.service'
import type { AssignedTrainingInsert } from '@/repositories/assigned-training.repo'
import { certificationKeys } from '@/hooks/use-certifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const trainingAdminKeys = {
  matrix: ['training-admin', 'compliance-matrix'] as const
}

export function useComplianceMatrix() {
  const db = createClient()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: trainingAdminKeys.matrix,
    queryFn: () => fetchComplianceMatrix(db)
  })

  const completeMutation = useMutation({
    mutationFn: (input: CompleteCertificationInput) => completeCertification(db, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trainingAdminKeys.matrix })
      qc.invalidateQueries({ queryKey: certificationKeys.all })
    }
  })

  const assignMutation = useMutation({
    mutationFn: (entries: AssignedTrainingInsert[]) =>
      Promise.all(entries.map((e) => createAssignedTraining(db, e))),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingAdminKeys.matrix })
  })

  return {
    data: query.data,
    loading: query.isLoading,
    error: query.error,
    markComplete: (input: CompleteCertificationInput) => completeMutation.mutateAsync(input),
    assignCourse: (entries: AssignedTrainingInsert[]) => assignMutation.mutateAsync(entries),
    isMarkingComplete: completeMutation.isPending,
    isAssigning: assignMutation.isPending
  }
}
