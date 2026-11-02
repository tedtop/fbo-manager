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
  departure_time: '2026-03-10T17:00:00Z',
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
      createdBy: { initials: 'ADM', name: 'Admin', department: 'System' },
      updatedAt: '2026-03-01T00:00:00Z',
    })
  })

  it('falls back to empty strings/arrays for missing data', () => {
    const f = apiFlightToComponentFlight({ id: 'x', created_at: 'c' })
    expect(f.tailNumber).toBe('')
    expect(f.aircraftType).toBe('')
    expect(f.services).toEqual([])
  })

  it('prefers creator info and modified_at when present', () => {
    const f = apiFlightToComponentFlight({
      ...baseRow,
      created_by_initials: 'TT',
      created_by_name: 'Ted',
      created_by_department: 'Line',
      created_by_source: 'front-desk',
      modified_at: '2026-03-02T00:00:00Z',
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

    // KNOWN BUG F3: flips when B10 lands (en-route has no DB representation)
    it('KNOWN BUG F3: en-route round-trips to scheduled, never back to en-route', () => {
      const backend = mapStatusToBackend('en-route')
      expect(backend).toBe('scheduled')
      expect(apiFlightToComponentFlight({ ...baseRow, flight_status: backend }).status).toBe(
        'scheduled'
      )
    })
  })

  describe('type inference', () => {
    // KNOWN BUG F1: flips when B09 lands (both times should not always mean quick_turn)
    it('KNOWN BUG F1: any flight with both times is quick_turn, even multi-day stays', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        arrival_time: '2026-03-08T10:00:00Z',
        departure_time: '2026-03-12T10:00:00Z',
      })
      expect(f.type).toBe('quick_turn')
    })

    it('KNOWN BUG F1: departure-only row (departure_time is NOT NULL) is departure', () => {
      expect(apiFlightToComponentFlight(baseRow).type).toBe('departure')
    })

    // KNOWN BUG F1: flips when B09 lands (arrival-only should be reachable)
    it('KNOWN BUG F1: arrival-only type is only reachable with a missing departure_time (impossible in DB)', () => {
      const f = apiFlightToComponentFlight({
        id: 1,
        created_at: 'c',
        arrival_time: '2026-03-10T10:00:00Z',
      })
      expect(f.type).toBe('arrival')
    })
  })

  describe('origin fallback', () => {
    it('uses origin when set', () => {
      const f = apiFlightToComponentFlight({ ...baseRow, origin: 'KSFO', destination: 'KLAX' })
      expect(f.origin).toBe('KSFO')
    })
    it('falls back to destination when arrival exists and origin is empty', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        arrival_time: '2026-03-10T10:00:00Z',
        destination: 'KLAX',
      })
      expect(f.origin).toBe('KLAX')
    })
    it('does not fall back without an arrival time', () => {
      expect(apiFlightToComponentFlight({ ...baseRow, destination: 'KLAX' }).origin).toBeUndefined()
    })
  })

  describe('duration', () => {
    it('is the arrival-to-departure gap in minutes', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        arrival_time: '2026-03-10T15:00:00Z',
        departure_time: '2026-03-10T17:30:00Z',
      })
      expect(f.duration).toBe(150)
    })
    it('has a 45 minute minimum', () => {
      const f = apiFlightToComponentFlight({
        ...baseRow,
        arrival_time: '2026-03-10T15:00:00Z',
        departure_time: '2026-03-10T15:10:00Z',
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

  it('maps en-route to scheduled (KNOWN BUG F3: flips when B10 lands)', () => {
    expect(componentFlightToApiRequest({ status: 'en-route' }).flight_status).toBe('scheduled')
  })

  it('adds a MAN- call_sign only for manual- ids', () => {
    expect(componentFlightToApiRequest({ id: 'manual-1' }).call_sign).toMatch(/^MAN-\d+$/)
    expect(componentFlightToApiRequest({ id: '42' }).call_sign).toBeUndefined()
  })

  // KNOWN BUG F2: flips when B09/B13 land (timestamps should carry a timezone offset)
  it('KNOWN BUG F2: passes timestamps through verbatim, offset-less local strings stay offset-less', () => {
    const r = componentFlightToApiRequest({
      arrivalTime: '2026-03-10T09:00',
      departureTime: '2026-03-10T11:30:00',
    })
    expect(r.arrival_time).toBe('2026-03-10T09:00')
    expect(r.departure_time).toBe('2026-03-10T11:30:00')
    expect(r.arrival_time).not.toMatch(/(Z|[+-]\d{2}:?\d{2})$/)
  })
})
