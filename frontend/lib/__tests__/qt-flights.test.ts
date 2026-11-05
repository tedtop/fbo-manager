import { describe, expect, it } from 'vitest'
import { filterFlights } from '@/components/flight-operations/board-logic'
import type { FlightFilters } from '@/components/flight-operations/types'
import { qtDispatchToFlight, qtDispatchesToFlights } from '@/lib/qt-flights'
import type { QTDispatch } from '@/types/qt-dispatch'

const ZONE = 'America/Denver'

const dispatch = (over: Partial<QTDispatch> = {}): QTDispatch => ({
  TransactionID: 'abc-123',
  FlightNumber: 'UA1436',
  TailNumber: 'n37420',
  AirlineName: 'UA/United Airlines',
  AircraftType: '737',
  Destination: 'DEN',
  FlightStatus: 'Planned',
  Quantity: 2463,
  QuantityInWeight: 16500,
  ArrivalDate: '2026-11-04 13:10',
  DepartureDate: '2026-11-04 14:37',
  Gate: '4',
  TerminalNumber: 'A',
  ...over
})

describe('qtDispatchToFlight', () => {
  it('marks the flight as QT with a prefixed id, so it can never collide with a flight row', () => {
    const flight = qtDispatchToFlight(dispatch(), ZONE)
    expect(flight.source).toBe('qt')
    expect(flight.id).toBe('qt:abc-123')
    expect(flight.tailNumber).toBe('N37420')
    expect(flight.callSign).toBe('UA1436')
    expect(flight.contactName).toBe('UA/United Airlines')
  })

  it('reads QT times as airport-local, not browser-local (MST is UTC-7 in November)', () => {
    const flight = qtDispatchToFlight(dispatch(), ZONE)
    expect(flight.arrivalTime).toBe('2026-11-04T20:10:00.000Z')
    expect(flight.departureTime).toBe('2026-11-04T21:37:00.000Z')
  })

  it('maps QT ramp states onto board statuses', () => {
    const status = (s: QTDispatch['FlightStatus']) => qtDispatchToFlight(dispatch({ FlightStatus: s }), ZONE).status
    expect(status('Planned')).toBe('scheduled')
    expect(status('In')).toBe('arrived')
    expect(status('In Flight')).toBe('departed')
    expect(status('Completed')).toBe('departed')
  })

  it('hides departed airline flights by default, which Show hidden reveals', () => {
    const filters: FlightFilters = { search: '', status: 'all', dateRange: 'all', services: [], showHidden: false }
    const gone = qtDispatchToFlight(dispatch({ FlightStatus: 'In Flight' }), ZONE)
    const here = qtDispatchToFlight(dispatch({ FlightStatus: 'In' }), ZONE)
    expect(filterFlights([gone, here], filters)).toEqual([here])
    expect(filterFlights([gone, here], { ...filters, showHidden: true })).toHaveLength(2)
  })

  it('never flags an airline turn as a quick turn (that chip is also labelled QT)', () => {
    const quick = qtDispatchToFlight(dispatch({ DepartureDate: '2026-11-04 13:40' }), ZONE)
    expect(quick.isQuickTurn).toBe(false)
    expect(quick.type).toBe('overnight') // both times set: listed in both columns
  })

  it("drops QT's unset dates and keeps the flight in one column", () => {
    const flight = qtDispatchToFlight(dispatch({ DepartureDate: '0001-01-01 00:00' }), ZONE)
    expect(flight.departureTime).toBeUndefined()
    expect(flight.type).toBe('arrival')
  })

  it('puts fuel, gate and MEL in the notes, and hides unassigned gates', () => {
    const noted = qtDispatchToFlight(dispatch({ MEL: true, MELMessage: 'APU inop' }), ZONE).notes
    expect(noted).toContain('Fuel: 16,500 lbs (2,463 gal)')
    expect(noted).toContain('Gate A4')
    expect(noted).toContain('MEL: APU inop')
    expect(qtDispatchToFlight(dispatch({ Gate: '?', TerminalNumber: '?' }), ZONE).notes).not.toContain('Gate')
  })

  it('leaves out dispatches with no usable time at all', () => {
    const flights = qtDispatchesToFlights(
      [dispatch(), dispatch({ TransactionID: 'x', ArrivalDate: undefined, DepartureDate: '0001-01-01 00:00' })],
      ZONE
    )
    expect(flights).toHaveLength(1)
  })
})

describe('search', () => {
  it('finds an airline flight by its flight number as well as its tail', () => {
    const filters: FlightFilters = { search: 'ua1436', status: 'all', dateRange: 'all', services: [], showHidden: false }
    const flight = qtDispatchToFlight(dispatch(), ZONE)
    expect(filterFlights([flight], filters)).toHaveLength(1)
    expect(filterFlights([flight], { ...filters, search: 'n37420' })).toHaveLength(1)
    expect(filterFlights([flight], { ...filters, search: 'zz9' })).toHaveLength(0)
  })
})

describe('airline filter', () => {
  const filters: FlightFilters = { search: '', status: 'all', dateRange: 'all', services: [], showHidden: false }
  const qt = qtDispatchToFlight(dispatch(), ZONE)
  const ga = { ...qt, id: '7', source: 'front-desk' as const }

  it('shows airline flights by default and hides only QT ones when asked', () => {
    expect(filterFlights([qt, ga], filters).map((f) => f.id)).toEqual(['qt:abc-123', '7'])
    expect(filterFlights([qt, ga], { ...filters, hideAirlines: true }).map((f) => f.id)).toEqual(['7'])
  })
})
