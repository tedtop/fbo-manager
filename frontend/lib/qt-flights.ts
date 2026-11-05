import type { Flight, FlightStatus } from '@/components/flight-operations/types'
import { toInstantIso } from '@/lib/local-date'
import type { QTDispatch } from '@/types/qt-dispatch'

// QT airline dispatches shown on the Arrivals/Departures board next to the GA flights. They are merged in
// the browser from the live QT feed and never stored, so they cannot be edited, hidden, serviced or
// deleted here: change them in QT. Their ids carry this prefix so they can never collide with a flight row.
export const QT_FLIGHT_PREFIX = 'qt:'

export const isQtFlight = (flight: Pick<Flight, 'source'>): boolean => flight.source === 'qt'

// QT's own ramp states mapped onto the board's: Planned = inbound/scheduled, In = on the ground,
// In Flight / Completed = it has left.
function boardStatus(qt: QTDispatch['FlightStatus']): FlightStatus {
  switch (qt) {
    case 'In':
      return 'arrived'
    case 'In Flight':
    case 'Completed':
      return 'departed'
    default:
      return 'scheduled'
  }
}

// "YYYY-MM-DD HH:mm" in the airport's zone -> UTC instant; QT's unset dates ("0001-01-01 ...") -> undefined.
function qtInstant(value: string | undefined, zone: string): string | undefined {
  if (!value || value.startsWith('0001-01-01')) return undefined
  const iso = toInstantIso(value, zone)
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso
}

const UNKNOWN = new Set(['', '?', '-', 'Unknown'])
const known = (value: string | undefined): string | undefined =>
  value && !UNKNOWN.has(value.trim()) ? value.trim() : undefined

/**
 * One QT dispatch as a board Flight. `fboZone` is the airport's own zone (QT sends local times with no
 * offset), not the board's display zone, which may be Zulu.
 */
export function qtDispatchToFlight(dispatch: QTDispatch, fboZone: string): Flight {
  const arrivalTime = qtInstant(dispatch.ArrivalDate, fboZone)
  const departureTime = qtInstant(dispatch.DepartureDate, fboZone)
  const stayMinutes =
    arrivalTime && departureTime
      ? Math.floor((new Date(departureTime).getTime() - new Date(arrivalTime).getTime()) / 60000)
      : null

  const gate = known(dispatch.Gate)
  const terminal = known(dispatch.TerminalNumber)
  const gateLabel = gate ? `Gate ${terminal && terminal !== '0' ? terminal : ''}${gate}` : undefined
  const fuel = dispatch.QuantityInWeight > 0
    ? `${dispatch.QuantityInWeight.toLocaleString()} lbs (${dispatch.Quantity.toLocaleString()} gal)`
    : undefined
  const now = new Date().toISOString()

  return {
    id: `${QT_FLIGHT_PREFIX}${dispatch.TransactionID ?? `${dispatch.FlightNumber}-${dispatch.TailNumber}`}`,
    tailNumber: (dispatch.TailNumber ?? '').trim().toUpperCase(),
    aircraftType: dispatch.AircraftType ?? '',
    callSign: dispatch.FlightNumber,
    arrivalTime,
    departureTime,
    // Never a quick turn: that flag is the GA +1 hour rule and its "QT" chip would read as the QT source.
    isQuickTurn: false,
    type: arrivalTime && departureTime ? 'overnight' : arrivalTime ? 'arrival' : 'departure',
    status: boardStatus(dispatch.FlightStatus),
    origin: known(dispatch.Origin),
    destination: known(dispatch.Destination),
    contactName: dispatch.AirlineName || undefined,
    services: [],
    notes: [fuel ? `Fuel: ${fuel}` : null, gateLabel, dispatch.MEL ? `MEL: ${dispatch.MELMessage || 'item on this aircraft'}` : null]
      .filter(Boolean)
      .join(' · ') || undefined,
    duration: Math.max(45, stayMinutes ?? 45),
    source: 'qt',
    createdBy: { initials: 'AIR', name: 'QT Technologies', department: 'Airline dispatch' },
    createdAt: now,
    updatedAt: now
  }
}

// Sorted into the same list as the GA flights; a flight with no usable time at all is dropped.
export function qtDispatchesToFlights(dispatches: QTDispatch[], fboZone: string): Flight[] {
  return dispatches
    .map((d) => qtDispatchToFlight(d, fboZone))
    .filter((f) => f.arrivalTime || f.departureTime)
}
