'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type FilterChangeInsert,
  type NoteInsert,
  type ReadingInsert,
  createFilterChange,
  createNote,
  createReading,
  deleteFilterChange,
  deleteNote,
  deleteReading,
  findFilterChanges,
  findLatestFilterChanges,
  findLatestReadings,
  findNotes,
  findReadings,
  updateNote,
} from '@/repositories/equipment-log.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const logKeys = {
  all: ['equipment-log'] as const,
  readings: (id: number) => [...logKeys.all, 'readings', id] as const,
  filters: (id: number) => [...logKeys.all, 'filters', id] as const,
  notes: (id: number) => [...logKeys.all, 'notes', id] as const,
  latestReadings: () => [...logKeys.all, 'latest-readings'] as const,
  latestFilters: () => [...logKeys.all, 'latest-filters'] as const,
}

/** Latest DPI / nozzle PSI reading per equipment id (the list card). */
export function useLatestReadings() {
  const db = createClient()
  return useQuery({ queryKey: logKeys.latestReadings(), queryFn: () => findLatestReadings(db) })
}

/** Latest filter change per equipment id (the list card). */
export function useLatestFilterChanges() {
  const db = createClient()
  return useQuery({ queryKey: logKeys.latestFilters(), queryFn: () => findLatestFilterChanges(db) })
}

export function useReadings(equipmentId: number) {
  const db = createClient()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: logKeys.all })
  const query = useQuery({ queryKey: logKeys.readings(equipmentId), queryFn: () => findReadings(db, equipmentId) })
  const create = useMutation({ mutationFn: (row: ReadingInsert) => createReading(db, row), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: number) => deleteReading(db, id), onSuccess: invalidate })
  return { readings: query.data ?? [], loading: query.isLoading, error: query.error, create: create.mutateAsync, remove: remove.mutateAsync }
}

export function useFilterChanges(equipmentId: number) {
  const db = createClient()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: logKeys.all })
  const query = useQuery({ queryKey: logKeys.filters(equipmentId), queryFn: () => findFilterChanges(db, equipmentId) })
  const create = useMutation({ mutationFn: (row: FilterChangeInsert) => createFilterChange(db, row), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: number) => deleteFilterChange(db, id), onSuccess: invalidate })
  return { changes: query.data ?? [], loading: query.isLoading, error: query.error, create: create.mutateAsync, remove: remove.mutateAsync }
}

export function useNotes(equipmentId: number) {
  const db = createClient()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: logKeys.all })
  const query = useQuery({ queryKey: logKeys.notes(equipmentId), queryFn: () => findNotes(db, equipmentId) })
  const create = useMutation({ mutationFn: (row: NoteInsert) => createNote(db, row), onSuccess: invalidate })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => updateNote(db, id, { body }),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: number) => deleteNote(db, id), onSuccess: invalidate })
  return {
    notes: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
  }
}
