'use client'

import { creatorFromUser } from '@/components/flight-operations/creator'
import { resolveCreatorId } from '@/lib/flight-creator'
import { createClient } from '@/lib/supabase/client'
import {
  createFlight as createFlightRepo,
  deleteFlight as deleteFlightRepo,
  findAllFlights,
  findFlightById,
  hiddenAtForStatusChange,
  serviceKeysFromRow,
  serviceQuantitiesFromRow,
  setFlightHidden,
  updateFlight as updateFlightRepo,
  type FlightFilters
} from '@/repositories/flights.repo'
import { findActiveServices, setFlightServices } from '@/repositories/services.repo'
import { serviceKeys } from '@/hooks/use-services'
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
import { useAppSettings } from '@/hooks/use-app-settings'
import { useRef } from 'react'
import { FLIGHTS_POLL_MS, useFlightsRealtime } from '@/hooks/use-flights-realtime'

export const flightKeys = {
  all: ['flights'] as const,
  lists: () => [...flightKeys.all, 'list'] as const,
  list: (filters?: FlightFilters) => [...flightKeys.lists(), filters] as const
}

export function rowToFlight(row: any): Flight {
  return apiFlightToComponentFlight({
    id: row.id,
    aircraft: row.tail_number,
    aircraft_type_display: row.aircraft?.aircraft_type_display,
    parking_area: row.aircraft?.parked_area ?? null,
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
    service_quantities: serviceQuantitiesFromRow(row),
    fuel_order_notes: row.fuel_order_notes,
    location_id: row.location_id,
    passenger_count: row.passenger_count,
    notes: row.notes,
    created_by_source: row.created_by_source,
    // B17: creator comes from the joined users row; no row means the neutral legacy fallback in types.ts
    ...(row.created_by
      ? (({ initials, name, department }) => ({
          created_by_initials: initials,
          created_by_name: name,
          created_by_department: department
        }))(creatorFromUser(row.created_by))
      : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    hidden_at: row.hidden_at
  } as any)
}

export function useFlights(params?: {
  today?: boolean
  startDate?: string
  endDate?: string
  includeHidden?: boolean
  // IANA zone whose midnights bound the date params (the board's display zone). Part of the query key.
  zone?: string
  // Hold the fetch until the zone is known (first visit before the settings load); default on.
  enabled?: boolean
}) {
  const qc = useQueryClient()
  const db = createClient()
  // "The day after departure" for hiding a Departed flight is the FBO's day, never the Zulu day.
  const { settings } = useAppSettings()
  const fboZone = settings.timeZone

  const filters: FlightFilters | undefined = params
    ? {
        today: params.today,
        startDate: params.startDate,
        endDate: params.endDate,
        includeHidden: params.includeHidden,
        zone: params.zone
      }
    : undefined

  const realtimeLive = useFlightsRealtime(qc)

  const query = useQuery({
    queryKey: flightKeys.list(filters),
    // Keep showing the previous window's flights while a new window/filter key loads, so changing the
    // week or date range does not blank the board (B18). `loading` stays true only for a first load.
    placeholderData: keepPreviousData,
    enabled: params?.enabled ?? true,
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

  // Writes the services through the RPC, then re-reads the flight (fresh updated_at + embedded services).
  const saveServices = async (
    flightId: number,
    keys: string[],
    quantities: Record<string, number> | null | undefined,
    failureTitle: string
  ) => {
    try {
      // Quantities go out only for services whose catalog quantity_unit is set (the catalog is cached).
      let sendable: Record<string, number> | undefined
      if (quantities && Object.keys(quantities).length > 0) {
        const catalog = await qc.ensureQueryData({ queryKey: serviceKeys.active(), queryFn: () => findActiveServices(db) })
        sendable = Object.fromEntries(
          keys.flatMap((k) => (catalog.some((s) => s.key === k && s.quantity_unit) && quantities[k] !== undefined ? [[k, quantities[k]]] : []))
        )
      }
      await setFlightServices(db, flightId, keys, sendable)
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
        created_by_source: requestData.created_by_source ?? 'line-department',
        // B17: the signed-in user's users.id; undefined (key omitted) lets the DB default apply
        created_by_id: await resolveCreatorId(db)
      })
      const keys: string[] = requestData.services ?? []
      if (keys.length === 0) return rowToFlight(row)
      // Create is two steps (insert, then the idempotent RPC). A failure here leaves the flight created
      // without its services, so say so; the board refreshes (saveServices invalidates) and shows the new flight.
      return rowToFlight(await saveServices(Number(row.id), keys, requestData.service_quantities, 'Flight created, but its services were not saved'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
      expectedUpdatedAt
    }: {
      id: string
      updates: Partial<Flight>
      expectedUpdatedAt?: string
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
      // caught by expectedUpdatedAt like any other edit.
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
          'actual_departure_time' in dbUpdates ? dbUpdates.actual_departure_time : undefined,
          new Date(),
          fboZone
        )
        if (hiddenAt !== undefined) dbUpdates.hidden_at = hiddenAt
      }

      // A services-only edit still goes through the compare-and-swap: touching updated_at is a no-op write
      // (the trigger sets the real value) that gives the guarded update something to write.
      const keys: string[] | undefined = requestData.services
      if (keys !== undefined && Object.keys(dbUpdates).length === 0) dbUpdates.updated_at = new Date().toISOString()
      const row = await updateFlightRepo(db, Number(id), dbUpdates, expectedUpdatedAt)
      if (keys === undefined) return rowToFlight(row)
      // The RPC bumps updated_at again, so the flight is re-read afterwards: the caller (and the board)
      // must see the post-RPC updated_at or the next edit's compare-and-swap would report a false conflict.
      return rowToFlight(await saveServices(Number(id), keys, requestData.service_quantities, 'Flight updated, but its services were not saved'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: flightKeys.all })
  })

  // Hide / Unhide button: same compare-and-swap guard as updateFlight (ConcurrencyConflictError).
  const hiddenMutation = useMutation({
    mutationFn: async ({
      id,
      hidden,
      expectedUpdatedAt
    }: {
      id: string
      hidden: boolean
      expectedUpdatedAt?: string
    }) => rowToFlight(await setFlightHidden(db, Number(id), hidden, expectedUpdatedAt)),
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
      expectedUpdatedAt?: string
    ) => updateMutation.mutateAsync({ id, updates, expectedUpdatedAt }),
    setFlightHidden: (id: string, hidden: boolean, expectedUpdatedAt?: string) =>
      hiddenMutation.mutateAsync({ id, hidden, expectedUpdatedAt }),
    deleteFlight: (id: string, options?: { keepRow?: boolean }) =>
      deleteMutation.mutateAsync({ id, keepRow: options?.keepRow }),
    forgetFlight,
    refetch: query.refetch
  }
}
