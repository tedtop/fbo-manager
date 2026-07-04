'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type AircraftInsert,
  type AircraftRow,
  type AircraftUpdate,
  createAircraft,
  deleteAircraft,
  findAllAircraft,
  updateAircraft
} from '@/repositories/aircraft.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const aircraftKeys = {
  all: ['aircraft'] as const,
  lists: () => [...aircraftKeys.all, 'list'] as const
}

export function useAircraft() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: aircraftKeys.lists(),
    queryFn: () => findAllAircraft(db)
  })

  const createMutation = useMutation({
    mutationFn: (aircraft: AircraftInsert) => createAircraft(db, aircraft),
    onSuccess: () => qc.invalidateQueries({ queryKey: aircraftKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({
      tailNumber,
      updates
    }: { tailNumber: string; updates: AircraftUpdate }) =>
      updateAircraft(db, tailNumber, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: aircraftKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (tailNumber: string) => deleteAircraft(db, tailNumber),
    onSuccess: () => qc.invalidateQueries({ queryKey: aircraftKeys.all })
  })

  const findByTailNumber = (tailNumber: string): AircraftRow | undefined =>
    query.data?.find(
      (a) => a.tail_number.toLowerCase() === tailNumber.toLowerCase()
    )

  return {
    aircraft: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createAircraft: (
      tailNumber: string,
      aircraftTypeDisplay: string,
      aircraftTypeIcao = 'UNKN'
    ) =>
      createMutation.mutateAsync({
        tail_number: tailNumber,
        aircraft_type_display: aircraftTypeDisplay,
        aircraft_type_icao: aircraftTypeIcao,
        airline_icao: '',
        fleet_id: ''
      }),
    updateAircraft: (
      tailNumber: string,
      aircraftTypeDisplay: string,
      aircraftTypeIcao?: string
    ) =>
      updateMutation.mutateAsync({
        tailNumber,
        updates: {
          aircraft_type_display: aircraftTypeDisplay,
          aircraft_type_icao: aircraftTypeIcao,
          airline_icao: '',
          fleet_id: ''
        }
      }),
    deleteAircraft: (tailNumber: string) =>
      deleteMutation.mutateAsync(tailNumber),
    findByTailNumber,
    refetch: query.refetch
  }
}
