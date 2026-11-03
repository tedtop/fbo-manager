import { cn } from '@/lib/utils'
import { FlightCard } from './flight-card'
import { FlightCardSkeleton } from './flight-card-skeleton'
import type { Flight } from './types'

// A deleted card plays its zap (see .animate-flight-zap), then its row collapses so the cards below
// slide up. The board waits this long before dropping the flight from the list.
export const ZAP_MS = 600
const ZAP_COLLAPSE_DELAY_MS = 320

const LOADING_PLACEHOLDERS = 3

export type FlightDeletePhase = 'deleting' | 'zapping'

interface FlightListProps {
  flights: Flight[]
  type: 'arrival' | 'departure'
  theme: 'dark' | 'light'
  loading?: boolean
  onEditFlight: (
    flight: Flight,
    expectedModifiedAt?: string
  ) => void | Promise<void>
  onDeleteFlight: (id: string) => void
  deletePhases?: Record<string, FlightDeletePhase>
  onOrderFuel?: (flight: Flight) => void
  linkedFlightIds?: Set<string>
  flightLinkColors?: Map<string, string>
  hoveredFlightId?: string | null
  onFlightHover?: (id: string | null) => void
}

export function FlightList({
  flights,
  type,
  theme,
  loading,
  onEditFlight,
  onDeleteFlight,
  deletePhases,
  onOrderFuel,
  linkedFlightIds,
  flightLinkColors,
  hoveredFlightId,
  onFlightHover
}: FlightListProps) {
  const label = type === 'arrival' ? 'arrivals' : 'departures'

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label={`Loading ${label}`}>
        {Array.from({ length: LOADING_PLACEHOLDERS }, (_, i) => (
          <FlightCardSkeleton
            key={i}
            className="animate-in fade-in duration-500 fill-mode-backwards"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    )
  }

  if (flights.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No {label} found
      </div>
    )
  }

  return (
    <div className="-mb-3">
      {flights.map((flight, index) => {
        const isLinked = linkedFlightIds?.has(flight.id) || false
        const linkColor = flightLinkColors?.get(flight.id)
        const isHovered = hoveredFlightId === flight.id
        const phase = deletePhases?.[flight.id]
        const zapping = phase === 'zapping'

        return (
          // The grid-rows 1fr -> 0fr transition collapses the row's height; the inner padding
          // supplies the gap between cards so it collapses with the card.
          <div
            key={flight.id}
            className={cn(
              'grid animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards',
              zapping
                ? 'grid-rows-[0fr] transition-[grid-template-rows] ease-in'
                : 'grid-rows-[1fr]'
            )}
            style={{
              animationDelay: `${Math.min(index, 8) * 40}ms`,
              ...(zapping && {
                transitionDelay: `${ZAP_COLLAPSE_DELAY_MS}ms`,
                transitionDuration: `${ZAP_MS - ZAP_COLLAPSE_DELAY_MS}ms`
              })
            }}
          >
            <div className={cn('min-h-0', zapping && 'overflow-hidden')}>
              <div className="pb-3">
                <FlightCard
                  flight={flight}
                  theme={theme}
                  onEdit={onEditFlight}
                  onDelete={onDeleteFlight}
                  onOrderFuel={onOrderFuel}
                  isLinked={isLinked}
                  linkColor={linkColor}
                  isHovered={isHovered}
                  onHover={onFlightHover}
                  column={type}
                  deleteState={phase}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
