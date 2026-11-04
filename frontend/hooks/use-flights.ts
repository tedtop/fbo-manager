'use client'

import { createClient } from '@/lib/supabase/client'
import {
  createFlight as createFlightRepo,
  deleteFlight as deleteFlightRepo,
  findAllFlights,
  findFlightById,
  hiddenAtForStatusChange,
  serviceKeysFromRow,
  setFlightHidden,
  updateFlight as updateFlightRepo,
  type FlightFilters
} from '@/repositories/flights.repo'
import { setFlightServices } from '@/repositories/services.repo'
import { describeError } from '@/lib/error-message'
import {
  type Flight,
  apiFlightToComponentFlight,
  componentFlightToApiRequest,
  mapStatusToBackend
} from '@/components/flight-operations/types'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { useRef } from 'react'
import { FLIGHTS_POLL_MS, useFlightsRealtime } from '@/hooks/use-flights-realtime'

export const flightKeys = {
  all: ['flights'] as const,
  lists: () => [...flightKeys.all, 'list'] as const,
  list: (filters?: FlightFilters) => [...flightKeys.lists(), filters] as const
}

function rowToFlight(row: any): Flight {
  return apiFlightToComponentFlight({
    id: row.id,
    aircraft: row.tail_number,
    aircraft_type_display: row.aircraft?.aircraft_type_display,
    call_sign: row.call_sign,
    scheduled_arrival_time: row.scheduled_arrival_time,
    scheduled_departure_time: row.scheduled_departure_time,
    actual_arrival_time: row.actual_arrival_time,
    actual_departure_time: row.actual_departure_time,
    is_quick_turn: row.is_quick_turn,
    flight_status: row.flight_status as any,
    origin: row.origin,
    destination: row.destination,
    contact_name: row.contact_name,
    contact_notes: row.contact_notes,
    // B26b: the junction (embedded flight_service) is the single source of the key array
    services: serviceKeysFromRow(row),
    fuel_order_notes: row.fuel_order_notes,
    location_id: row.location_id,
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
    modified_at: row.modified_at,
    hidden_at: row.hidden_at
  } as any)
}

export function useFlights(params?: {
  today?: boolean
  startDate?: string
  endDate?: string
  includeHidden?: boolean
}) {
  const qc = useQueryClient()
  const db = createClient()

  const filters: FlightFilters | undefined = params
    ? {
        today: params.today,
        startDate: params.startDate,
        endDate: params.endDate,
        includeHidden: params.includeHidden
      }
    : undefined

  const realtimeLive = useFlightsRealtime(qc)

  const query = useQuery({
    queryKey: flightKeys.list(filters),
    // Keep showing the previous window's flights while a new window/filter key loads, so changing the
    // week or date range does not blank the board (B18). `loading` stays true only for a first load.
    placeholderData: keepPreviousData,
    // Polling fallback: only while the realtime channel is not SUBSCRIBED.
    refetchInterval: realtimeLive ? false : FLIGHTS_POLL_MS,
    queryFn: async () => {
      const rows = await findAllFlights(db, filters)
      return rows.map(rowToFlight)
    }
  })

  // A refetch after a failure with nothing cached resets the query to pending and clears its error, which
  // would flip the board from the error state to skeletons and back. Keep reporting the last failure until
  // a fetch succeeds so the error state (with Retry) stays put while it retries.
  const lastError = useRef<Error | null>(null)
  if (query.error) lastError.current = query.error
  else if (query.isSuccess) lastError.current = null

  // Writes the services through the RPC, then re-reads the flight (fresh modified_at + embedded services).
  const saveServices = async (flightId: number, keys: string[], failureTitle: string) => {
    try {
      await setFlightServices(db, flightId, keys)
    } catch (err) {
      // The flight row was already written, so the board must refresh even though the mutation fails. (A plain
      // onSettled invalidate would also refetch after a refused compare-and-swap and clobber the stale card.)
      void qc.invalidateQueries({ queryKey: flightKeys.all })
      throw new Error(`${failureTitle}: ${describeError(err)}`)
    }
    const fresh = await findFlightById(db, flightId)
    if (!fresh) throw new Error(`${failureTitle}: the flight could not be reloaded`)
    return fresh
  }

  const createMutation = useMutation({
    mutationFn: async (flight: Partial<Flight>) => {
      const requestData = componentFlightToApiRequest(flight)
      const row = await createFlightRepo(db, {
        tail_number: requestData.aircraft,
        call_sign: requestData.call_sign,
        scheduled_arrival_time: requestData.scheduled_arrival_time,
        scheduled_departure_time: requestData.scheduled_departure_time,
        actual_arrival_time: requestData.actual_arrival_time,
        actual_departure_time: requestData.actual_departure_time,
        is_quick_turn: requestData.is_quick_turn,
        flight_status: requestData.flight_status ?? 'scheduled',
        origin: requestData.origin ?? '',
        destination: requestData.destination ?? '',
        contact_name: requestData.contact_name ?? '',
        contact_notes: requestData.contact_notes ?? '',
        // Services are written by set_flight_services below (junction + the legacy column in one transaction)
        services: [],
        fuel_order_notes: requestData.fuel_order_notes ?? '',
        location_id: requestData.location_id,
        passenger_count: requestData.passenger_count,
        notes: requestData.notes ?? '',
        created_by_source: requestData.created_by_source ?? 'line-department'
      })
      const keys: string[] = requestData.services ?? []
      if (keys.length === 0) return rowToFlight(row)
      // Create is two steps (insert, then the idempotent RPC). A failure here leaves the flight created
      // without its services, so say so; the board refreshes (saveServices invalidates) and shows the new flight.
      return rowToFlight(await saveServices(Number(row.id), keys, 'Flight created, but its services were not saved'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
      expectedModifiedAt
    }: {
      id: string
      updates: Partial<Flight>
      expectedModifiedAt?: string
    }) => {
      const requestData = componentFlightToApiRequest(updates)
      const dbUpdates: Record<string, any> = {}
      if (requestData.aircraft !== undefined) dbUpdates.tail_number = requestData.aircraft
      if (requestData.call_sign !== undefined) dbUpdates.call_sign = requestData.call_sign
      if (requestData.scheduled_arrival_time !== undefined) dbUpdates.scheduled_arrival_time = requestData.scheduled_arrival_time
      if (requestData.scheduled_departure_time !== undefined) dbUpdates.scheduled_departure_time = requestData.scheduled_departure_time
      if (requestData.actual_arrival_time !== undefined) dbUpdates.actual_arrival_time = requestData.actual_arrival_time
      if (requestData.actual_departure_time !== undefined) dbUpdates.actual_departure_time = requestData.actual_departure_time
      if (requestData.is_quick_turn !== undefined) dbUpdates.is_quick_turn = requestData.is_quick_turn
      if (requestData.flight_status !== undefined) dbUpdates.flight_status = requestData.flight_status
      if (requestData.origin !== undefined) dbUpdates.origin = requestData.origin
      if (requestData.destination !== undefined) dbUpdates.destination = requestData.destination
      if (requestData.contact_name !== undefined) dbUpdates.contact_name = requestData.contact_name
      if (requestData.contact_notes !== undefined) dbUpdates.contact_notes = requestData.contact_notes
      if (requestData.fuel_order_notes !== undefined) dbUpdates.fuel_order_notes = requestData.fuel_order_notes
      if (requestData.location_id !== undefined) dbUpdates.location_id = requestData.location_id
      if (requestData.passenger_count !== undefined) dbUpdates.passenger_count = requestData.passenger_count
      if (requestData.notes !== undefined) dbUpdates.notes = requestData.notes
      if (requestData.created_by_source !== undefined) dbUpdates.created_by_source = requestData.created_by_source

      // D13: a status change to/from Departed also moves hidden_at (hides from the next day / un-hides). The
      // flight's current values come from the cached board, so the save needs no extra read; a stale cache is
      // caught by expectedModifiedAt like any other edit.
      const previous = qc
        .getQueriesData<Flight[]>({ queryKey: flightKeys.lists() })
        .flatMap(([, list]) => list ?? [])
        .find((f) => f.id === id)
      if (previous && dbUpdates.flight_status !== undefined) {
        const hiddenAt = hiddenAtForStatusChange(
          {
            flight_status: mapStatusToBackend(previous.status),
            hidden_at: previous.hiddenAt ?? null,
            actual_departure_time: previous.actualDepartureTime ?? null
          },
          dbUpdates.flight_status,
          'actual_departure_time' in dbUpdates ? dbUpdates.actual_departure_time : undefined
        )
        if (hiddenAt !== undefined) dbUpdates.hidden_at = hiddenAt
      }

      // A services-only edit still goes through the compare-and-swap: touching modified_at is a no-op write
      // (the trigger sets the real value) that gives the guarded update something to write.
      const keys: string[] | undefined = requestData.services
      if (keys !== undefined && Object.keys(dbUpdates).length === 0) dbUpdates.modified_at = new Date().toISOString()
      const row = await updateFlightRepo(db, Number(id), dbUpdates, expectedModifiedAt)
      if (keys === undefined) return rowToFlight(row)
      // The RPC bumps modified_at again, so the flight is re-read afterwards: the caller (and the board)
      // must see the post-RPC modified_at or the next edit's compare-and-swap would report a false conflict.
      return rowToFlight(await saveServices(Number(id), keys, 'Flight updated, but its services were not saved'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  // Hide / Unhide button: same compare-and-swap guard as updateFlight (ConcurrencyConflictError).
  const hiddenMutation = useMutation({
    mutationFn: async ({
      id,
      hidden,
      expectedModifiedAt
    }: {
      id: string
      hidden: boolean
      expectedModifiedAt?: string
    }) => rowToFlight(await setFlightHidden(db, Number(id), hidden, expectedModifiedAt)),
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  // With keepRow the flight stays in the cached lists after the soft delete, so the board can play
  // its exit animation; the caller then drops it with forgetFlight.
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string; keepRow?: boolean }) =>
      deleteFlightRepo(db, Number(id)),
    onSuccess: (_data, { keepRow }) => {
      if (!keepRow) qc.invalidateQueries({ queryKey: flightKeys.all })
    }
  })

  const forgetFlight = (id: string) => {
    qc.setQueriesData<Flight[]>({ queryKey: flightKeys.lists() }, (old) =>
      old?.filter((f) => f.id !== id)
    )
    qc.invalidateQueries({ queryKey: flightKeys.all })
  }

  return {
    flights: query.data ?? [],
    loading: query.isLoading,
    // Any fetch in flight, including background refetches (drives the subtle inline indicator).
    fetching: query.isFetching,
    // The flights shown belong to the previous query key while the new one loads.
    isPlaceholder: query.isPlaceholderData,
    error: query.error ?? lastError.current,
    createFlight: (flight: Partial<Flight>) => createMutation.mutateAsync(flight),
    updateFlight: (
      id: string,
      updates: Partial<Flight>,
      expectedModifiedAt?: string
    ) => updateMutation.mutateAsync({ id, updates, expectedModifiedAt }),
    setFlightHidden: (id: string, hidden: boolean, expectedModifiedAt?: string) =>
      hiddenMutation.mutateAsync({ id, hidden, expectedModifiedAt }),
    deleteFlight: (id: string, options?: { keepRow?: boolean }) =>
      deleteMutation.mutateAsync({ id, keepRow: options?.keepRow }),
    forgetFlight,
    refetch: query.refetch
  }
}
