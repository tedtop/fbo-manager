'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useMemo, useState } from 'react'
import {
  assignLinkColors,
  filterFlights,
  linkedFlightIds,
  partitionFlights
} from './board-logic'
import { FlightList, type FlightDeletePhase, ZAP_MS } from './flight-list'
import type { FlightFilters as FilterType, Flight } from './types'

interface FlightBoardProps {
  mode: 'split' | 'arrivals' | 'departures'
  theme: 'dark' | 'light'
  flights: Flight[]
  onAddFlight: (flight: Flight) => void
  onEditFlight: (
    flight: Flight,
    expectedModifiedAt?: string
  ) => void | Promise<void>
  // Should reject if the delete fails; the card then comes back and an error toast shows.
  onDeleteFlight: (id: string) => void | Promise<void>
  // Called once a deleted card has finished its exit animation and can leave the list.
  onDeleteExited?: (id: string) => void
  onOrderFuel?: (flight: Flight) => void
  filters: FilterType
  loading?: boolean
}

// Minimum time a card spends fading into its skeleton, so the fade reads even when the save is instant.
const DELETING_MIN_MS = 450

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export function FlightBoard({
  mode,
  theme,
  flights,
  onEditFlight,
  onDeleteFlight,
  onDeleteExited,
  onOrderFuel,
  filters,
  loading
}: FlightBoardProps) {
  const [hoveredFlightId, setHoveredFlightId] = useState<string | null>(null)
  const [deletePhases, setDeletePhases] = useState<
    Record<string, FlightDeletePhase>
  >({})

  const setDeletePhase = (id: string, phase?: FlightDeletePhase) =>
    setDeletePhases((prev) => {
      const { [id]: _, ...rest } = prev
      return phase ? { ...rest, [id]: phase } : rest
    })

  // Keyed by flight id, so a flight shown in both columns (quick turn) animates in both.
  const handleDelete = async (id: string) => {
    if (deletePhases[id]) return
    setDeletePhase(id, 'deleting')
    try {
      await Promise.all([onDeleteFlight(id), wait(DELETING_MIN_MS)])
    } catch {
      // The page handler already showed the error toast; just bring the card back.
      setDeletePhase(id)
      return
    }
    setDeletePhase(id, 'zapping')
    await wait(ZAP_MS)
    onDeleteExited?.(id)
    setDeletePhase(id)
  }

  const filteredFlights = useMemo(
    () => filterFlights(flights, filters),
    [filters, flights]
  )

  const { arrivals, departures } = partitionFlights(filteredFlights)

  // Flights listed in both columns are one record: link their cards (shared color, hover together).
  const linkedIds = useMemo(
    () => linkedFlightIds(arrivals, departures),
    [arrivals, departures]
  )
  const flightLinkColors = useMemo(() => assignLinkColors(linkedIds), [linkedIds])

  return (
    <div className="space-y-6">
      {mode === 'split' ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-success" />
              <h2 className="text-2xl font-bold text-foreground">Arrivals</h2>
              {loading ? (
                <Skeleton className="h-4 w-6" />
              ) : (
                <span className="text-sm text-muted-foreground">
                  ({arrivals.length})
                </span>
              )}
            </div>
            <FlightList
              flights={arrivals}
              type="arrival"
              theme={theme}
              onEditFlight={onEditFlight}
              onDeleteFlight={handleDelete}
              deletePhases={deletePhases}
              loading={loading}
              onOrderFuel={onOrderFuel}
              linkedFlightIds={linkedIds}
              flightLinkColors={flightLinkColors}
              hoveredFlightId={hoveredFlightId}
              onFlightHover={setHoveredFlightId}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <h2 className="text-2xl font-bold text-foreground">Departures</h2>
              {loading ? (
                <Skeleton className="h-4 w-6" />
              ) : (
                <span className="text-sm text-muted-foreground">
                  ({departures.length})
                </span>
              )}
            </div>
            <FlightList
              flights={departures}
              type="departure"
              theme={theme}
              onEditFlight={onEditFlight}
              onDeleteFlight={handleDelete}
              deletePhases={deletePhases}
              loading={loading}
              onOrderFuel={onOrderFuel}
              linkedFlightIds={linkedIds}
              flightLinkColors={flightLinkColors}
              hoveredFlightId={hoveredFlightId}
              onFlightHover={setHoveredFlightId}
            />
          </div>
        </div>
      ) : mode === 'arrivals' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-2 h-2 rounded-full bg-success" />
            <h2 className="text-2xl font-bold text-foreground">Arrivals</h2>
            {loading ? (
              <Skeleton className="h-4 w-6" />
            ) : (
              <span className="text-sm text-muted-foreground">
                ({arrivals.length})
              </span>
            )}
          </div>
          <FlightList
            flights={arrivals}
            type="arrival"
            theme={theme}
            onEditFlight={onEditFlight}
            onDeleteFlight={handleDelete}
            deletePhases={deletePhases}
            loading={loading}
            onOrderFuel={onOrderFuel}
            linkedFlightIds={linkedIds}
            flightLinkColors={flightLinkColors}
            hoveredFlightId={hoveredFlightId}
            onFlightHover={setHoveredFlightId}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <h2 className="text-2xl font-bold text-foreground">Departures</h2>
            {loading ? (
              <Skeleton className="h-4 w-6" />
            ) : (
              <span className="text-sm text-muted-foreground">
                ({departures.length})
              </span>
            )}
          </div>
          <FlightList
            flights={departures}
            type="departure"
            theme={theme}
            onEditFlight={onEditFlight}
            onDeleteFlight={handleDelete}
            deletePhases={deletePhases}
            loading={loading}
            onOrderFuel={onOrderFuel}
            linkedFlightIds={linkedIds}
            flightLinkColors={flightLinkColors}
            hoveredFlightId={hoveredFlightId}
            onFlightHover={setHoveredFlightId}
          />
        </div>
      )}
    </div>
  )
}
