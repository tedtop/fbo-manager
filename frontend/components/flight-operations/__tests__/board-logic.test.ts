import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { filterFlights, partitionFlights, weekRange } from '../board-logic'
import type { Flight, FlightFilters } from '../types'

function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    id: '1',
    tailNumber: 'N123AB',
    aircraftType: 'C172',
    arrivalTime: '2026-03-10T14:00:00Z',
    departureTime: '2026-03-10T15:00:00Z',
    isQuickTurn: true,
    type: 'quick_turn',
    status: 'scheduled',
    services: [],
    duration: 45,
    source: 'qt',
    createdBy: { initials: 'ADM', name: 'Admin', department: 'System' },
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

const noFilters: FlightFilters = {
  search: '',
  status: 'all',
  dateRange: 'all',
  services: [],
}

describe('partitionFlights', () => {
  const quickTurn = makeFlight({ id: 'qt' })
  const stay = makeFlight({
    id: 'stay',
    type: 'overnight',
    isQuickTurn: false,
    departureTime: '2026-03-12T15:00:00Z',
  })
  const arrivalOnly = makeFlight({
    id: 'arr',
    type: 'arrival',
    isQuickTurn: false,
    departureTime: undefined,
  })
  const departureOnly = makeFlight({
    id: 'dep',
    type: 'departure',
    isQuickTurn: false,
    arrivalTime: undefined,
  })
  const flights = [quickTurn, stay, arrivalOnly, departureOnly]

  it('puts a quick turn in both columns', () => {
    const { arrivals, departures } = partitionFlights([quickTurn])
    expect(arrivals.map((f) => f.id)).toEqual(['qt'])
    expect(departures.map((f) => f.id)).toEqual(['qt'])
  })

  it('puts arrival-only (return) flights only in arrivals', () => {
    const { arrivals, departures } = partitionFlights(flights)
    expect(arrivals.map((f) => f.id)).toContain('arr')
    expect(departures.map((f) => f.id)).not.toContain('arr')
  })

  it('puts departure-only (hangar pull) flights only in departures', () => {
    const { arrivals, departures } = partitionFlights(flights)
    expect(departures.map((f) => f.id)).toContain('dep')
    expect(arrivals.map((f) => f.id)).not.toContain('dep')
  })

  it('lists a non-QT flight with both times in both columns (it arrives and departs)', () => {
    const { arrivals, departures } = partitionFlights([stay])
    expect(arrivals.map((f) => f.id)).toEqual(['stay'])
    expect(departures.map((f) => f.id)).toEqual(['stay'])
  })

  it('classifies by the scheduled times, not the derived type label', () => {
    const { arrivals, departures } = partitionFlights([
      makeFlight({ id: 'x', type: 'quick_turn', departureTime: undefined }),
    ])
    expect(arrivals.map((f) => f.id)).toEqual(['x'])
    expect(departures).toEqual([])
  })

  it('returns empty columns for empty input', () => {
    expect(partitionFlights([])).toEqual({ arrivals: [], departures: [] })
  })

  it('preserves input order', () => {
    const { arrivals, departures } = partitionFlights(flights)
    expect(arrivals.map((f) => f.id)).toEqual(['qt', 'stay', 'arr'])
    expect(departures.map((f) => f.id)).toEqual(['qt', 'stay', 'dep'])
  })
})

describe('filterFlights', () => {
  const flights = [
    makeFlight({
      id: 'a',
      tailNumber: 'N111AA',
      aircraftType: 'C172',
      origin: 'KSFO',
      destination: 'KLAX',
      contactName: 'Alice Pilot',
      status: 'scheduled',
      services: ['fuel', 'hangar'],
    }),
    makeFlight({
      id: 'b',
      tailNumber: 'N222BB',
      aircraftType: 'GLF4',
      origin: 'KJFK',
      destination: 'KBOS',
      contactName: 'Bob Captain',
      status: 'arrived',
      services: ['fuel'],
    }),
    makeFlight({
      id: 'c',
      tailNumber: 'N333CC',
      aircraftType: 'PC12',
      status: 'cancelled',
      services: [],
    }),
  ]
  const ids = (list: Flight[]) => list.map((f) => f.id)

  it('returns everything for empty filters', () => {
    expect(ids(filterFlights(flights, noFilters))).toEqual(['a', 'b', 'c'])
  })

  it('searches tail number case-insensitively', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'n222bb' }))).toEqual(['b'])
  })

  it('searches aircraft type', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'glf' }))).toEqual(['b'])
  })

  it('searches origin', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'ksfo' }))).toEqual(['a'])
  })

  it('searches destination', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'kbos' }))).toEqual(['b'])
  })

  it('searches contact name', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'alice' }))).toEqual(['a'])
  })

  it('does not throw on flights with missing optional fields', () => {
    expect(ids(filterFlights(flights, { ...noFilters, search: 'zzz' }))).toEqual([])
  })

  it('filters by status', () => {
    expect(ids(filterFlights(flights, { ...noFilters, status: 'arrived' }))).toEqual(['b'])
  })

  it('requires ALL selected services (AND)', () => {
    expect(
      ids(filterFlights(flights, { ...noFilters, services: ['fuel', 'hangar'] }))
    ).toEqual(['a'])
    expect(ids(filterFlights(flights, { ...noFilters, services: ['fuel'] }))).toEqual(['a', 'b'])
  })

  it('returns none when a required service is absent everywhere', () => {
    expect(ids(filterFlights(flights, { ...noFilters, services: ['catering'] }))).toEqual([])
  })

  it('combines search, status and services with AND', () => {
    const f = { search: 'n', status: 'scheduled' as const, dateRange: 'all' as const, services: ['fuel'] }
    expect(ids(filterFlights(flights, f))).toEqual(['a'])
  })

  // KNOWN BUG F4: flips when B13 lands (dateRange should narrow results)
  it('KNOWN BUG F4: dateRange is ignored, flights far in the past still pass', () => {
    const old = makeFlight({ id: 'old', departureTime: '2020-01-01T00:00:00Z' })
    for (const dateRange of ['today', 'tomorrow', 'week', 'all'] as const) {
      expect(ids(filterFlights([old], { ...noFilters, dateRange }))).toEqual(['old'])
    }
  })
})

describe('weekRange', () => {
  const originalTZ = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/New_York'
  })
  afterAll(() => {
    if (originalTZ === undefined) Reflect.deleteProperty(process.env, 'TZ')
    else process.env.TZ = originalTZ
  })

  const HOUR = 3600_000

  it('starts on Sunday midnight for a midweek date', () => {
    const { start, end } = weekRange(new Date(2026, 5, 10, 13, 30), 0) // Wed Jun 10
    expect(start).toEqual(new Date(2026, 5, 7, 0, 0, 0, 0))
    expect(start.getDay()).toBe(0)
    expect(end).toEqual(new Date(2026, 5, 14, 0, 0, 0, 0))
  })

  it('keeps a Sunday date in its own week', () => {
    const { start } = weekRange(new Date(2026, 5, 7, 9), 0)
    expect(start).toEqual(new Date(2026, 5, 7))
  })

  it('treats Saturday 23:59 as the last moment of the week; end is exclusive', () => {
    const { start, end } = weekRange(new Date(2026, 5, 13, 23, 59, 59), 0)
    expect(start).toEqual(new Date(2026, 5, 7))
    expect(end).toEqual(new Date(2026, 5, 14))
    const nextMidnight = new Date(2026, 5, 14, 0, 0, 0, 0)
    expect(nextMidnight.getTime() < end.getTime()).toBe(false)
  })

  it('treats exactly Sunday 00:00 as the start of the new week', () => {
    const { start } = weekRange(new Date(2026, 5, 14, 0, 0, 0, 0), 0)
    expect(start).toEqual(new Date(2026, 5, 14))
  })

  it('shifts by weekOffset +1 and -1', () => {
    const base = new Date(2026, 5, 10)
    expect(weekRange(base, 1).start).toEqual(new Date(2026, 5, 14))
    expect(weekRange(base, -1).start).toEqual(new Date(2026, 4, 31))
  })

  it('does not mutate the input date', () => {
    const d = new Date(2026, 5, 10, 13)
    const copy = d.getTime()
    weekRange(d, 1)
    expect(d.getTime()).toBe(copy)
  })

  it('spring-forward week (Mar 8 2026, US) is 167 hours but still Sunday midnight to Sunday midnight', () => {
    const { start, end } = weekRange(new Date(2026, 2, 11, 12), 0)
    expect(start).toEqual(new Date(2026, 2, 8, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 2, 15, 0, 0, 0, 0))
    expect(start.getDay()).toBe(0)
    expect(end.getDay()).toBe(0)
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * HOUR - HOUR)
  })

  it('fall-back week (Nov 1 2026, US) is 169 hours and still aligned to local midnight', () => {
    const { start, end } = weekRange(new Date(2026, 10, 4, 12), 0)
    expect(start).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0))
    expect(end).toEqual(new Date(2026, 10, 8, 0, 0, 0, 0))
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * HOUR + HOUR)
  })

  it('weekOffset across the DST boundary lands on Sunday midnight', () => {
    const { start, end } = weekRange(new Date(2026, 2, 4, 12), 1)
    expect(start).toEqual(new Date(2026, 2, 8))
    expect(end).toEqual(new Date(2026, 2, 15))
  })

  // KNOWN BUG F5-adjacent: results are runtime-local, so same instant gives different weeks per TZ
  it('is timezone dependent: the same instant falls in different weeks in different zones', () => {
    const instant = new Date('2026-06-14T03:00:00Z') // Sun 03:00Z
    process.env.TZ = 'UTC'
    const utcStart = weekRange(instant, 0).start.toISOString()
    process.env.TZ = 'America/New_York' // still Sat 23:00 local
    const nyStart = weekRange(instant, 0).start.toISOString()
    expect(utcStart).not.toBe(nyStart)
  })
})
