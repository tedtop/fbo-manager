import { withTz } from '@/tests/support/with-tz'
import { describe, expect, it } from 'vitest'
import {
  apiFlightToComponentFlight,
  componentFlightToApiRequest,
  mapStatusToBackend,
  type FlightRow,
} from '../types'

const baseRow: FlightRow = {
  id: 7,
  aircraft: 'N123AB',
  created_at: '2026-03-01T00:00:00Z',
  scheduled_departure_time: '2026-03-10T17:00:00Z',
}

describe('apiFlightToComponentFlight', () => {
  it('maps core fields and defaults', () => {
    const f = apiFlightToComponentFlight({
      ...baseRow,
      aircraft_type_display: 'C172',
      contact_name: 'Alice',
      passenger_count: 3,
      services: ['fuel'],
    } as FlightRow)
    expect(f).toMatchObject({
      id: '7',
      tailNumber: 'N123AB',
      aircraftType: 'C172',
      contactName: 'Alice',
      passengers: 3,
      services: ['fuel'],
      status: 'scheduled',
      source: 'qt',
      // B17: no creator data on the row = the neutral legacy fallback, never a fake admin
      createdBy: { initials: '--', name: 'Unknown creator', department: 'No creator recorded' },
      updatedAt: '2026-03-01T00:00:00Z',
    })
  })

  it('falls back to empty strings/arrays for missing data', () => {
    const f = apiFlightToComponentFlight({ id: 'x', created_at: 'c' })
    expect(f.tailNumber).toBe('')
    expect(f.aircraftType).toBe('')
    expect(f.services).toEqual([])
  })

  it('prefers creator info and updated_at when present', () => {
    const f = apiFlightToComponentFlight({
      ...baseRow,
      created_by_initials: 'TT',
      created_by_name: 'Ted',
      created_by_department: 'Line',
      created_by_source: 'front-desk',
      updated_at: '2026-03-02T00:00:00Z',
    })
    expect(f.createdBy).toEqual({ initials: 'TT', name: 'Ted', department: 'Line' })
    expect(f.source).toBe('front-desk')
    expect(f.updatedAt).toBe('2026-03-02T00:00:00Z')
  })

  describe('status mapping', () => {
    it.each([
      ['scheduled', 'scheduled'],
      ['planned', 'scheduled'],
      ['arrived', 'arrived'],
      ['departed', 'departed'],
      ['delayed', 'delayed'],
      ['cancelled', 'cancelled'],
    ] as const)('%s -> %s', (db, ui) => {
      expect(apiFlightToComponentFlight({ ...baseRow, flight_status: db }).status).toBe(ui)
    })

    it('defaults to scheduled when status is missing', () => {
      expect(apiFlightToComponentFlight(baseRow).status).toBe('scheduled')
    })

    // F3 fixed (B14): the DB has no en-route status, so the UI no longer offers one; every UI status round-trips.
    it.each(['scheduled', 'arrived', 'departed', 'delayed', 'cancelled'] as const)(
      '%s round-trips through the DB value unchanged',
      (status) => {
        const backend = mapStatusToBackend(status)
        expect(apiFlightToComponentFlight({ ...baseRow, flight_status: backend }).status).toBe(status)
      }
    )
  })

  describe('type inference', () => {
    const arr = '2026-03-10T10:00:00Z'

    it('both times with is_quick_turn is a quick_turn', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        scheduled_arrival_time: arr,
        scheduled_departure_time: '2026-03-10T11:00:00Z',
        is_quick_turn: true,
      })
      expect(f.type).toBe('quick_turn')
      expect(f.isQuickTurn).toBe(true)
    })

    it('both times without is_quick_turn is a longer stay, no longer a quick turn (F1)', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        scheduled_arrival_time: '2026-03-08T10:00:00Z',
        scheduled_departure_time: '2026-03-12T10:00:00Z',
      })
      expect(f.type).toBe('overnight')
      expect(f.isQuickTurn).toBe(false)
    })

    it('departure-only (hangar pull) is departure with no arrival', () => {
      const f = apiFlightToComponentFlight(baseRow)
      expect(f.type).toBe('departure')
      expect(f.arrivalTime).toBeUndefined()
    })

    it('arrival-only (return) is arrival and is null-safe without a departure', () => {
      const f = apiFlightToComponentFlight({
        id: 1,
        created_at: 'c',
        scheduled_arrival_time: arr,
        scheduled_departure_time: null,
      })
      expect(f.type).toBe('arrival')
      expect(f.departureTime).toBeUndefined()
    })

    it('ignores is_quick_turn when a scheduled time is missing', () => {
      const f = apiFlightToComponentFlight({ ...baseRow, is_quick_turn: true })
      expect(f.isQuickTurn).toBe(false)
    })

    it('carries the actual times', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        actual_arrival_time: '2026-03-10T10:07:00Z',
        actual_departure_time: '2026-03-10T11:02:00Z',
      })
      expect(f.actualArrivalTime).toBe('2026-03-10T10:07:00Z')
      expect(f.actualDepartureTime).toBe('2026-03-10T11:02:00Z')
    })
  })

  describe('origin and destination', () => {
    it('uses origin when set', () => {
      const f = apiFlightToComponentFlight({ ...baseRow, origin: 'KSFO', destination: 'KLAX' })
      expect(f.origin).toBe('KSFO')
    })
    it('does not borrow the destination as the origin of an arrival (its destination is the home airport)', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        scheduled_arrival_time: '2026-03-10T10:00:00Z',
        destination: 'KMSO',
      })
      expect(f.origin).toBeUndefined()
      expect(f.destination).toBe('KMSO')
    })
    it('leaves origin undefined when it is empty', () => {
      expect(apiFlightToComponentFlight({ ...baseRow, destination: 'KLAX' }).origin).toBeUndefined()
    })
  })

  describe('duration', () => {
    it('is the arrival-to-departure gap in minutes', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        scheduled_arrival_time: '2026-03-10T15:00:00Z',
        scheduled_departure_time: '2026-03-10T17:30:00Z',
      })
      expect(f.duration).toBe(150)
    })
    it('has a 45 minute minimum', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        scheduled_arrival_time: '2026-03-10T15:00:00Z',
        scheduled_departure_time: '2026-03-10T15:10:00Z',
      })
      expect(f.duration).toBe(45)
    })
    it('is 45 for single-time flights', () => {
      expect(apiFlightToComponentFlight(baseRow).duration).toBe(45)
    })
  })
})

describe('mapStatusToBackend', () => {
  it.each([
    ['scheduled', 'scheduled'],
    ['arrived', 'arrived'],
    ['departed', 'departed'],
    ['delayed', 'delayed'],
    ['cancelled', 'cancelled'],
  ] as const)('%s -> %s', (ui, db) => {
    expect(mapStatusToBackend(ui)).toBe(db)
  })
})

describe('componentFlightToApiRequest', () => {
  it('maps component fields to snake_case API fields', () => {
    expect(
      componentFlightToApiRequest({
        tailNumber: 'N1',
        origin: 'KSFO',
        destination: 'KLAX',
        status: 'delayed',
        contactName: 'A',
        contactNotes: 'n',
        passengers: 2,
        services: ['fuel'],
        notes: 'x',
        source: 'front-desk',
      })
    ).toEqual({
      aircraft: 'N1',
      origin: 'KSFO',
      destination: 'KLAX',
      flight_status: 'delayed',
      contact_name: 'A',
      contact_notes: 'n',
      passenger_count: 2,
      services: ['fuel'],
      notes: 'x',
      created_by_source: 'front-desk',
    })
  })

  it('returns an empty object for an empty partial', () => {
    expect(componentFlightToApiRequest({})).toEqual({})
  })

  it('omits undefined fields and drops null values', () => {
    const r = componentFlightToApiRequest({
      tailNumber: 'N1',
      origin: undefined,
      notes: null as unknown as string,
    })
    expect(r).toEqual({ aircraft: 'N1' })
  })

  it('sends a present-but-unset time as null (cleared) and leaves absent keys alone', () => {
    const r = componentFlightToApiRequest({
      arrivalTime: undefined,
      departureTime: '2026-03-10T11:00:00Z',
      actualArrivalTime: undefined,
    })
    expect(r).toEqual({
      scheduled_arrival_time: null,
      scheduled_departure_time: '2026-03-10T11:00:00Z',
      actual_arrival_time: null,
    })
  })

  it('maps actual times and the quick-turn flag', () => {
    const r = componentFlightToApiRequest({
      actualArrivalTime: '2026-03-10T10:07:00Z',
      actualDepartureTime: '2026-03-10T11:02:00Z',
      isQuickTurn: true,
    })
    expect(r).toMatchObject({
      actual_arrival_time: '2026-03-10T10:07:00Z',
      actual_departure_time: '2026-03-10T11:02:00Z',
      is_quick_turn: true,
    })
  })

  it('never generates a call_sign (the tail number identifies the aircraft)', () => {
    expect(componentFlightToApiRequest({ id: 'manual-1' }).call_sign).toBeUndefined()
    expect(componentFlightToApiRequest({ id: '42' }).call_sign).toBeUndefined()
  })

  // F2 fixed (B10): timestamps are sent as UTC instants
  it('converts offset-less local strings to UTC instants and keeps explicit offsets', () => {
    withTz('America/Phoenix', () => {
      const r = componentFlightToApiRequest({
        arrivalTime: '2026-03-10T09:00',
        departureTime: '2026-03-10T11:30:00',
        actualArrivalTime: '2026-03-10T09:05:00Z',
        actualDepartureTime: '2026-03-10T11:40:00-07:00',
      })
      expect(r.scheduled_arrival_time).toBe('2026-03-10T16:00:00.000Z')
      expect(r.scheduled_departure_time).toBe('2026-03-10T18:30:00.000Z')
      expect(r.actual_arrival_time).toBe('2026-03-10T09:05:00Z')
      expect(r.actual_departure_time).toBe('2026-03-10T11:40:00-07:00')
    })
  })

  it('sends a present-but-unset time as null', () => {
    expect(componentFlightToApiRequest({ arrivalTime: undefined }).scheduled_arrival_time).toBeNull()
  })
})

describe('F3 field round-trip (B14)', () => {
  const fullRow: FlightRow = {
    id: 11,
    aircraft: 'N999ZZ',
    aircraft_type_display: 'Gulfstream G650',
    call_sign: 'GLF1',
    scheduled_arrival_time: '2026-03-10T10:00:00Z',
    scheduled_departure_time: '2026-03-10T11:00:00Z',
    actual_arrival_time: '2026-03-10T10:07:00Z',
    actual_departure_time: '2026-03-10T11:02:00Z',
    is_quick_turn: true,
    flight_status: 'delayed',
    origin: 'KSFO',
    destination: 'KLAX',
    contact_name: 'Jane',
    contact_notes: 'crew car',
    services: ['fuel', 'hangar'],
    fuel_order_notes: 'Jet A 800 gal, top off',
    location_id: 42,
    passenger_count: 4,
    notes: 'VIP',
    created_by_source: 'front-desk',
    created_at: '2026-03-01T00:00:00Z',
  }

  it('maps fuel_order_notes and location_id onto the Flight', () => {
    const f = apiFlightToComponentFlight(fullRow)
    expect(f.fuelOrderNotes).toBe('Jet A 800 gal, top off')
    expect(f.locationId).toBe(42)
  })

  it('round-trips every mapped field through the update request', () => {
    const f = apiFlightToComponentFlight(fullRow)
    const r = componentFlightToApiRequest(f)
    expect(r).toMatchObject({
      aircraft: 'N999ZZ',
      scheduled_arrival_time: '2026-03-10T10:00:00Z',
      scheduled_departure_time: '2026-03-10T11:00:00Z',
      actual_arrival_time: '2026-03-10T10:07:00Z',
      actual_departure_time: '2026-03-10T11:02:00Z',
      is_quick_turn: true,
      flight_status: 'delayed',
      origin: 'KSFO',
      destination: 'KLAX',
      contact_name: 'Jane',
      contact_notes: 'crew car',
      services: ['fuel', 'hangar'],
      fuel_order_notes: 'Jet A 800 gal, top off',
      location_id: 42,
      passenger_count: 4,
      notes: 'VIP',
      created_by_source: 'front-desk',
    })
  })

  it('null/empty fuel_order_notes and null location_id map to unset', () => {
    const f = apiFlightToComponentFlight({ ...fullRow, fuel_order_notes: null, location_id: null })
    expect(f.fuelOrderNotes).toBeUndefined()
    expect(f.locationId).toBeUndefined()
    expect(apiFlightToComponentFlight({ ...fullRow, fuel_order_notes: '' }).fuelOrderNotes).toBeUndefined()
  })

  it('nulls in the row (times, optional text) do not throw and stay unset', () => {
    const f = apiFlightToComponentFlight({
      id: 1,
      created_at: 'c',
      scheduled_arrival_time: null,
      scheduled_departure_time: '2026-03-10T11:00:00Z',
      actual_arrival_time: null,
      actual_departure_time: null,
      is_quick_turn: null,
      passenger_count: null,
    })
    expect(f.actualArrivalTime).toBeUndefined()
    expect(f.actualDepartureTime).toBeUndefined()
    expect(f.isQuickTurn).toBe(false)
    expect(f.passengers).toBeUndefined()
  })

  it('an update that does not touch the fields omits fuel_order_notes and location_id', () => {
    const r = componentFlightToApiRequest({ notes: 'changed' })
    expect(r).toEqual({ notes: 'changed' })
    expect('fuel_order_notes' in r).toBe(false)
    expect('location_id' in r).toBe(false)
  })

  it('an explicit empty fuelOrderNotes is sent so the field can be cleared', () => {
    expect(componentFlightToApiRequest({ fuelOrderNotes: '' }).fuel_order_notes).toBe('')
  })
})

describe('parkingArea (aircraft.parked_area_id, read-only)', () => {
  const area = { id: 7, code: 'GH', name: 'Gold Hangars', kind: 'hangar' }

  it('maps the aircraft parking area when present', () => {
    expect(apiFlightToComponentFlight({ ...baseRow, parking_area: area }).parkingArea).toEqual(area)
  })

  it('is null when the aircraft has no parked area or the row omits it', () => {
    expect(apiFlightToComponentFlight({ ...baseRow, parking_area: null }).parkingArea).toBeNull()
    expect(apiFlightToComponentFlight(baseRow).parkingArea).toBeNull()
  })

  it('is not sent back to the API', () => {
    const request = componentFlightToApiRequest(
      apiFlightToComponentFlight({ ...baseRow, parking_area: area })
    )
    expect(request).not.toHaveProperty('parkingArea')
    expect(request).not.toHaveProperty('parking_area')
    expect(request).not.toHaveProperty('parked_area_id')
    expect(JSON.stringify(request)).not.toContain('Gold Hangars')
  })
})
