'use client'

import { createClient } from '@/lib/supabase/client'
import {
  createFlight as createFlightRepo,
  deleteFlight as deleteFlightRepo,
  findAllFlights,
  updateFlight as updateFlightRepo,
  type FlightFilters
} from '@/repositories/flights.repo'
import {
  type Flight,
  apiFlightToComponentFlight,
  componentFlightToApiRequest
} from '@/components/flight-operations/types'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const flightKeys = {
  all: ['flights'] as const,
  lists: () => [...flightKeys.all, 'list'] as const,
  list: (filters?: FlightFilters) => [...flightKeys.lists(), filters] as const
}

function rowToFlight(row: any): Flight {
  return apiFlightToComponentFlight({
    id: row.id,
    aircraft: row.aircraft_id,
    aircraft_type_display: row.aircraft?.aircraft_type_display,
    call_sign: row.call_sign,
    arrival_time: row.arrival_time,
    departure_time: row.departure_time,
    flight_status: row.flight_status as any,
    origin: row.origin,
    destination: row.destination,
    contact_name: row.contact_name,
    contact_notes: row.contact_notes,
    services: row.services,
    fuel_order_notes: row.fuel_order_notes,
    passenger_count: row.passenger_count,
    notes: row.notes,
    created_by_source: row.created_by_source,
    created_by_initials: row.created_by
      ? `${row.created_by.first_name?.[0] ?? ''}${row.created_by.last_name?.[0] ?? ''}`.toUpperCase() || 'ADM'
      : 'ADM',
    created_by_name: row.created_by
      ? `${row.created_by.first_name} ${row.created_by.last_name}`.trim() || row.created_by.username
      : 'Admin',
    created_by_department: row.created_by?.role === 'line'
      ? 'Line Department'
      : row.created_by?.role === 'frontdesk'
        ? 'Front Desk'
        : 'Administration',
    created_at: row.created_at,
    modified_at: row.modified_at
  } as any)
}

export function useFlights(params?: {
  today?: boolean
  startDate?: string
  endDate?: string
}) {
  const qc = useQueryClient()
  const db = createClient()
  const { user: currentUser } = useCurrentUser()

  const filters: FlightFilters | undefined = params
    ? {
        today: params.today,
        startDate: params.startDate,
        endDate: params.endDate
      }
    : undefined

  const query = useQuery({
    queryKey: flightKeys.list(filters),
    queryFn: async () => {
      const rows = await findAllFlights(db, filters)
      return rows.map(rowToFlight)
    }
  })

  const createMutation = useMutation({
    mutationFn: async (flight: Partial<Flight>) => {
      const requestData = componentFlightToApiRequest(flight)
      // flight.created_by_id is NOT NULL with no DB default (the old Django backend
      // defaulted it to the admin user); it has to come from the signed-in user's
      // legacy users row or the insert is rejected outright.
      if (!currentUser?.id) {
        throw new Error(
          'Cannot create flight: no users record found for the signed-in account'
        )
      }
      const row = await createFlightRepo(db, {
        created_by_id: currentUser.id,
        aircraft_id: requestData.aircraft,
        call_sign: requestData.call_sign,
        arrival_time: requestData.arrival_time,
        departure_time: requestData.departure_time,
        flight_status: requestData.flight_status ?? 'scheduled',
        origin: requestData.origin ?? '',
        destination: requestData.destination ?? '',
        contact_name: requestData.contact_name ?? '',
        contact_notes: requestData.contact_notes ?? '',
        services: requestData.services ?? [],
        fuel_order_notes: requestData.fuel_order_notes ?? '',
        passenger_count: requestData.passenger_count,
        notes: requestData.notes ?? '',
        created_by_source: requestData.created_by_source ?? 'line-department'
      })
      return rowToFlight(row)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Flight> }) => {
      const requestData = componentFlightToApiRequest(updates)
      const dbUpdates: Record<string, any> = {}
      if (requestData.aircraft !== undefined) dbUpdates.aircraft_id = requestData.aircraft
      if (requestData.call_sign !== undefined) dbUpdates.call_sign = requestData.call_sign
      if (requestData.arrival_time !== undefined) dbUpdates.arrival_time = requestData.arrival_time
      if (requestData.departure_time !== undefined) dbUpdates.departure_time = requestData.departure_time
      if (requestData.flight_status !== undefined) dbUpdates.flight_status = requestData.flight_status
      if (requestData.origin !== undefined) dbUpdates.origin = requestData.origin
      if (requestData.destination !== undefined) dbUpdates.destination = requestData.destination
      if (requestData.contact_name !== undefined) dbUpdates.contact_name = requestData.contact_name
      if (requestData.contact_notes !== undefined) dbUpdates.contact_notes = requestData.contact_notes
      if (requestData.services !== undefined) dbUpdates.services = requestData.services
      if (requestData.fuel_order_notes !== undefined) dbUpdates.fuel_order_notes = requestData.fuel_order_notes
      if (requestData.passenger_count !== undefined) dbUpdates.passenger_count = requestData.passenger_count
      if (requestData.notes !== undefined) dbUpdates.notes = requestData.notes
      if (requestData.created_by_source !== undefined) dbUpdates.created_by_source = requestData.created_by_source

      const row = await updateFlightRepo(db, Number(id), dbUpdates)
      return rowToFlight(row)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFlightRepo(db, Number(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  return {
    flights: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createFlight: (flight: Partial<Flight>) => createMutation.mutateAsync(flight),
    updateFlight: (id: string, updates: Partial<Flight>) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteFlight: (id: string) => deleteMutation.mutateAsync(id),
    refetch: query.refetch
  }
}
