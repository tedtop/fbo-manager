'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useMemo, useState } from 'react'
import { filterFlights, partitionFlights } from './board-logic'
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

  // Identify linked flights (appear in both arrivals and departures)
  const linkedFlightIds = useMemo(() => {
    const arrivalIds = new Set(arrivals.map((f) => f.id))
    const departureIds = new Set(departures.map((f) => f.id))
    const linked = new Set<string>()

    arrivalIds.forEach((id) => {
      if (departureIds.has(id)) {
        linked.add(id)
      }
    })

    return linked
  }, [arrivals, departures])

  // Assign colors to linked flights (rotating through a palette)
  const linkColors = [
    'border-l-emerald-500/60', // emerald
    'border-l-sky-500/60', // sky blue
    'border-l-violet-500/60', // violet
    'border-l-rose-500/60', // rose
    'border-l-amber-500/60', // amber
    'border-l-cyan-500/60', // cyan
    'border-l-pink-500/60', // pink
    'border-l-lime-500/60' // lime
  ]

  const flightLinkColors = useMemo(() => {
    const colorMap = new Map<string, string>()
    Array.from(linkedFlightIds).forEach((id, index) => {
      colorMap.set(id, linkColors[index % linkColors.length])
    })
    return colorMap
  }, [linkedFlightIds])

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
              linkedFlightIds={linkedFlightIds}
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
              linkedFlightIds={linkedFlightIds}
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
            linkedFlightIds={linkedFlightIds}
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
            linkedFlightIds={linkedFlightIds}
            flightLinkColors={flightLinkColors}
            hoveredFlightId={hoveredFlightId}
            onFlightHover={setHoveredFlightId}
          />
        </div>
      )}
    </div>
  )
}
