'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  assignLinkColors,
  clearActiveFilters,
  emptyStateMessage,
  filterFlights,
  linkedFlightIds,
  partitionFlights
} from './board-logic'
import { FlightEmptyState } from './flight-empty-state'
import { FlightList, type FlightDeletePhase, ZAP_MS } from './flight-list'
import type { FlightFilters as FilterType, Flight } from './types'

interface FlightBoardProps {
  mode: 'split' | 'arrivals' | 'departures'
  theme: 'dark' | 'light'
  flights: Flight[]
  onEditFlight: (
    flight: Flight,
    expectedUpdatedAt?: string
  ) => void | Promise<void>
  // Should reject if the delete fails; the card then comes back and an error toast shows.
  onDeleteFlight: (id: string) => void | Promise<void>
  // Hide / Unhide button on a card; same concurrency guard as edits (expectedUpdatedAt).
  onHideFlight?: (
    flight: Flight,
    expectedUpdatedAt?: string
  ) => void | Promise<void>
  onUnhideFlight?: (
    flight: Flight,
    expectedUpdatedAt?: string
  ) => void | Promise<void>
  // Called once a deleted card has finished its exit animation and can leave the list.
  onDeleteExited?: (id: string) => void
  onOrderFuel?: (flight: Flight) => void
  filters: FilterType
  // Lets the empty state offer "Clear filters".
  onFiltersChange?: (filters: FilterType) => void
  loading?: boolean
  // The flights shown are from the previous window/filter while the new one loads (dimmed slightly).
  stale?: boolean
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
  onHideFlight,
  onUnhideFlight,
  onDeleteExited,
  onOrderFuel,
  filters,
  onFiltersChange,
  loading,
  stale
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

  // Empty states: with only the date range applied, would the list hold flights? If so the filters
  // emptied it and the message names them; if not, the day/week itself is empty.
  const base = useMemo(
    () => partitionFlights(filterFlights(flights, clearActiveFilters(filters))),
    [filters, flights]
  )
  const clearFilters = onFiltersChange
    ? () => onFiltersChange(clearActiveFilters(filters))
    : undefined
  const columnEmpty = (noun: 'arrivals' | 'departures', baseCount: number) => {
    const { title, filtered } = emptyStateMessage(noun, filters, baseCount)
    return (
      <FlightEmptyState
        title={title}
        onClearFilters={filtered ? clearFilters : undefined}
      />
    )
  }
  // Split view with nothing in either column: one overall message (and one Clear filters action) above
  // two short column notes.
  const boardEmpty =
    mode === 'split' &&
    !loading &&
    arrivals.length === 0 &&
    departures.length === 0
  const arrivalsEmpty = boardEmpty ? (
    <FlightEmptyState title="No arrivals" className="py-6" />
  ) : (
    columnEmpty('arrivals', base.arrivals.length)
  )
  const departuresEmpty = boardEmpty ? (
    <FlightEmptyState title="No departures" className="py-6" />
  ) : (
    columnEmpty('departures', base.departures.length)
  )
  const overall = emptyStateMessage(
    'flights',
    filters,
    new Set([...base.arrivals, ...base.departures].map((f) => f.id)).size
  )

  // Flights listed in both columns are one record: link their cards (shared color, hover together).
  const linkedIds = useMemo(
    () => linkedFlightIds(arrivals, departures),
    [arrivals, departures]
  )
  const flightLinkColors = useMemo(() => assignLinkColors(linkedIds), [linkedIds])

  const allColumns = [
    {
      type: 'arrival' as const,
      title: 'Arrivals',
      dot: 'bg-success',
      flights: arrivals,
      empty: arrivalsEmpty
    },
    {
      type: 'departure' as const,
      title: 'Departures',
      dot: 'bg-accent',
      flights: departures,
      empty: departuresEmpty
    }
  ]
  const columns =
    mode === 'split'
      ? allColumns
      : allColumns.filter(
          (c) => c.type === (mode === 'arrivals' ? 'arrival' : 'departure')
        )

  return (
    <div
      className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}
      aria-busy={stale || loading || undefined}
    >
      {boardEmpty && (
        <FlightEmptyState
          title={overall.title}
          onClearFilters={overall.filtered ? clearFilters : undefined}
          className="rounded-lg border border-dashed border-border py-8"
        />
      )}
      <div
        className={cn(
          mode === 'split' && 'grid grid-cols-1 lg:grid-cols-2 gap-6',
          mode !== 'split' && 'space-y-4'
        )}
      >
        {columns.map((col) => (
          <div key={col.type} className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className={cn('w-2 h-2 rounded-full', col.dot)} />
              <h2 className="text-2xl font-bold text-foreground">{col.title}</h2>
              {loading ? (
                <Skeleton className="h-4 w-6" />
              ) : (
                <span className="text-sm text-muted-foreground">
                  ({col.flights.length})
                </span>
              )}
            </div>
            <FlightList
              flights={col.flights}
              type={col.type}
              theme={theme}
              onEditFlight={onEditFlight}
              onDeleteFlight={handleDelete}
              onHideFlight={onHideFlight}
              onUnhideFlight={onUnhideFlight}
              deletePhases={deletePhases}
              loading={loading}
              empty={col.empty}
              onOrderFuel={onOrderFuel}
              linkedFlightIds={linkedIds}
              flightLinkColors={flightLinkColors}
              hoveredFlightId={hoveredFlightId}
              onFlightHover={setHoveredFlightId}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
