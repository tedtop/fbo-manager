'use client'

import { createClient } from '@/lib/supabase/client'
import { findActiveStaff } from '@/repositories/staff.repo'
import {
  deleteCompletion,
  findAllCompletions
} from '@/repositories/training-completions.repo'
import {
  type TrainingCourseInsert,
  type TrainingCourseUpdate,
  createCourse,
  deleteCourse,
  findAllCourses,
  updateCourse
} from '@/repositories/training-courses.repo'
import {
  type RecordCompletionInput,
  buildComplianceMatrix,
  getCertificateUrl,
  recordCompletion
} from '@/services/training.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

export const trainingMatrixKeys = {
  all: ['training-matrix'] as const,
  courses: () => [...trainingMatrixKeys.all, 'courses'] as const,
  completions: () => [...trainingMatrixKeys.all, 'completions'] as const,
  staff: () => [...trainingMatrixKeys.all, 'staff'] as const
}

export function useTrainingMatrix() {
  const qc = useQueryClient()
  const db = createClient()

  const coursesQuery = useQuery({
    queryKey: trainingMatrixKeys.courses(),
    queryFn: () => findAllCourses(db, { includeInactive: true })
  })

  const completionsQuery = useQuery({
    queryKey: trainingMatrixKeys.completions(),
    queryFn: () => findAllCompletions(db)
  })

  const staffQuery = useQuery({
    queryKey: trainingMatrixKeys.staff(),
    queryFn: () => findActiveStaff(db)
  })

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: trainingMatrixKeys.all })

  const createCourseMutation = useMutation({
    mutationFn: (course: TrainingCourseInsert) => createCourse(db, course),
    onSuccess: invalidate
  })

  const updateCourseMutation = useMutation({
    mutationFn: ({
      id,
      updates
    }: { id: number; updates: TrainingCourseUpdate }) =>
      updateCourse(db, id, updates),
    onSuccess: invalidate
  })

  const deleteCourseMutation = useMutation({
    mutationFn: (id: number) => deleteCourse(db, id),
    onSuccess: invalidate
  })

  const recordCompletionMutation = useMutation({
    mutationFn: (input: RecordCompletionInput) => recordCompletion(db, input),
    onSuccess: invalidate
  })

  const deleteCompletionMutation = useMutation({
    mutationFn: (id: number) => deleteCompletion(db, id),
    onSuccess: invalidate
  })

  const allCourses = coursesQuery.data ?? []
  const activeCourses = useMemo(
    () => allCourses.filter((c) => c.is_active),
    [allCourses]
  )

  const matrix = useMemo(() => {
    if (!staffQuery.data || !coursesQuery.data || !completionsQuery.data)
      return null
    return buildComplianceMatrix(
      staffQuery.data,
      activeCourses,
      completionsQuery.data
    )
  }, [staffQuery.data, coursesQuery.data, completionsQuery.data, activeCourses])

  return {
    matrix,
    allCourses,
    loading:
      coursesQuery.isLoading ||
      completionsQuery.isLoading ||
      staffQuery.isLoading,
    error: coursesQuery.error ?? completionsQuery.error ?? staffQuery.error,
    refetch: () => {
      coursesQuery.refetch()
      completionsQuery.refetch()
      staffQuery.refetch()
    },
    createCourse: (course: TrainingCourseInsert) =>
      createCourseMutation.mutateAsync(course),
    updateCourse: (id: number, updates: TrainingCourseUpdate) =>
      updateCourseMutation.mutateAsync({ id, updates }),
    deleteCourse: (id: number) => deleteCourseMutation.mutateAsync(id),
    recordCompletion: (input: RecordCompletionInput) =>
      recordCompletionMutation.mutateAsync(input),
    deleteCompletion: (id: number) => deleteCompletionMutation.mutateAsync(id),
    getCertificateUrl: (path: string) => getCertificateUrl(db, path)
  }
}
