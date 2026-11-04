import { withTz } from '@/tests/support/with-tz'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  activeFilterParts,
  assignLinkColors,
  clearActiveFilters,
  dateRangeBounds,
  emptyStateMessage,
  filterFlights,
  hasActiveFilters,
  isFlightHidden,
  LINK_COLORS,
  linkedFlightIds,
  listFetchWindow,
  partitionFlights,
  flightradarUrl,
  weekDateParams,
  weekRange,
} from '../board-logic'
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
  showHidden: false,
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

  it('orders each column soonest first by its own scheduled time', () => {
    const early = makeFlight({
      id: 'early',
      arrivalTime: '2026-03-12T08:00:00Z',
      departureTime: '2026-03-12T09:00:00Z',
    })
    const late = makeFlight({
      id: 'late',
      arrivalTime: '2026-03-12T07:00:00Z',
      departureTime: '2026-03-12T15:00:00Z',
    })
    const { arrivals, departures } = partitionFlights([late, early])
    expect(arrivals.map((f) => f.id)).toEqual(['late', 'early'])
    expect(departures.map((f) => f.id)).toEqual(['early', 'late'])
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

  it('keeps input order for equal times', () => {
    const a = makeFlight({ id: 'a' })
    const b = makeFlight({ id: 'b' })
    const { arrivals, departures } = partitionFlights([b, a])
    expect(arrivals.map((f) => f.id)).toEqual(['b', 'a'])
    expect(departures.map((f) => f.id)).toEqual(['b', 'a'])
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
    const f = { search: 'n', status: 'scheduled' as const, dateRange: 'all' as const, services: ['fuel'], showHidden: false }
    expect(ids(filterFlights(flights, f))).toEqual(['a'])
  })
})

// B13 / F4: dateRange uses LOCAL days; a flight matches when its scheduled arrival OR departure is in range
// (actual times only when no scheduled time is set).
describe('filterFlights dateRange', () => {
  const ids = (list: Flight[]) => list.map((f) => f.id)
  const run = (
    tz: string,
    now: () => Date,
    flights: Flight[],
    dateRange: FlightFilters['dateRange']
  ) => withTz(tz, () => ids(filterFlights(flights, { ...noFilters, dateRange }, now())))
  const dep = (id: string, departureTime: string) =>
    makeFlight({ id, arrivalTime: undefined, departureTime })
  const arr = (id: string, arrivalTime: string) =>
    makeFlight({ id, arrivalTime, departureTime: undefined })

  describe('Phoenix (UTC-7, no DST)', () => {
    const tz = 'America/Phoenix'
    const now = () => new Date(2026, 5, 10, 13, 30) // Wed Jun 10 local
    // local Jun 10 = [2026-06-10T07:00Z, 2026-06-11T07:00Z)
    const flights = [
      dep('before', '2026-06-10T06:59:00Z'), // Jun 9 23:59 local
      dep('todayStart', '2026-06-10T07:00:00Z'), // Jun 10 00:00 local
      dep('todayEnd', '2026-06-11T06:59:00Z'), // Jun 10 23:59 local
      dep('tomorrowStart', '2026-06-11T07:00:00Z'), // Jun 11 00:00 local
      dep('tomorrowEnd', '2026-06-12T06:59:00Z'),
      dep('dayAfter', '2026-06-12T07:00:00Z'),
      dep('sat', '2026-06-14T06:59:00Z'), // Sat Jun 13 23:59 local, last moment of the week
      dep('nextSun', '2026-06-14T07:00:00Z'),
      dep('lastWeek', '2026-06-07T06:59:00Z') // Sat Jun 6 23:59 local
    ]

    it('today is the local day, midnight edges inclusive start / exclusive end', () => {
      expect(run(tz, now, flights, 'today')).toEqual(['todayStart', 'todayEnd'])
    })
    it('tomorrow is the next local day', () => {
      expect(run(tz, now, flights, 'tomorrow')).toEqual(['tomorrowStart', 'tomorrowEnd'])
    })
    it('week is the Sunday-start local week containing today', () => {
      expect(run(tz, now, flights, 'week')).toEqual([
        'before', 'todayStart', 'todayEnd', 'tomorrowStart', 'tomorrowEnd', 'dayAfter', 'sat'
      ]) // excludes nextSun (Jun 14 00:00 local) and lastWeek (Sat Jun 6)
    })
    it('all applies no date filter', () => {
      expect(run(tz, now, flights, 'all')).toEqual(ids(flights))
    })
    it('uses the local day, not the UTC day (21:00 local is the next UTC day)', () => {
      const late = dep('late', '2026-06-11T04:00:00Z') // Jun 10 21:00 local
      expect(run(tz, now, [late], 'today')).toEqual(['late'])
      expect(run(tz, now, [late], 'tomorrow')).toEqual([])
    })
  })

  describe('New York (DST)', () => {
    const tz = 'America/New_York'
    it('spring-forward day (Mar 8 2026, 23 h): edges follow local midnight', () => {
      const now = () => new Date(2026, 2, 8, 12)
      // Mar 8 local = [05:00Z, Mar 9 04:00Z); Mar 9 local = [04:00Z, Mar 10 04:00Z)
      const flights = [
        dep('beforeDay', '2026-03-08T04:59:00Z'),
        dep('dayStart', '2026-03-08T05:00:00Z'),
        dep('dayEnd', '2026-03-09T03:59:00Z'),
        dep('nextStart', '2026-03-09T04:00:00Z'),
        dep('nextEnd', '2026-03-10T03:59:00Z'),
        dep('afterNext', '2026-03-10T04:00:00Z')
      ]
      expect(run(tz, now, flights, 'today')).toEqual(['dayStart', 'dayEnd'])
      expect(run(tz, now, flights, 'tomorrow')).toEqual(['nextStart', 'nextEnd'])
    })

    it('fall-back day (Nov 1 2026, 25 h): the whole 25 h belongs to today', () => {
      const now = () => new Date(2026, 10, 1, 12)
      // Nov 1 local = [04:00Z, Nov 2 05:00Z)
      const flights = [
        dep('beforeDay', '2026-11-01T03:59:00Z'),
        dep('dayStart', '2026-11-01T04:00:00Z'),
        dep('repeatedHour', '2026-11-01T06:30:00Z'),
        dep('dayEnd', '2026-11-02T04:59:00Z'),
        dep('nextStart', '2026-11-02T05:00:00Z')
      ]
      expect(run(tz, now, flights, 'today')).toEqual(['dayStart', 'repeatedHour', 'dayEnd'])
      expect(run(tz, now, flights, 'tomorrow')).toEqual(['nextStart'])
    })

    it('week across the spring-forward boundary ends at local Sunday midnight', () => {
      const now = () => new Date(2026, 2, 11, 12) // Wed Mar 11
      // week = [Mar 8 05:00Z, Mar 15 04:00Z)
      const flights = [
        dep('in', '2026-03-15T03:59:00Z'),
        dep('out', '2026-03-15T04:00:00Z'),
        dep('prev', '2026-03-08T04:59:00Z')
      ]
      expect(run(tz, now, flights, 'week')).toEqual(['in'])
    })
  })

  describe('which time matches', () => {
    const tz = 'America/Phoenix'
    const now = () => new Date(2026, 5, 10, 12)
    const onToday = '2026-06-10T20:00:00Z'
    const onTomorrow = '2026-06-11T20:00:00Z'

    it('arrival-only flight (no departure) shows from its arrival day onward, never before', () => {
      expect(run(tz, now, [arr('a', onToday)], 'today')).toEqual(['a'])
      expect(run(tz, now, [arr('a', onToday)], 'tomorrow')).toEqual(['a'])
      expect(run(tz, now, [arr('a', onTomorrow)], 'today')).toEqual([])
    })
    it('departure-only flight matches on its departure day only', () => {
      expect(run(tz, now, [dep('d', onTomorrow)], 'tomorrow')).toEqual(['d'])
      expect(run(tz, now, [dep('d', onTomorrow)], 'today')).toEqual([])
      const later = () => new Date(2026, 5, 12, 12)
      expect(run(tz, later, [dep('d', onTomorrow)], 'today')).toEqual([])
    })
    it('quick turn is listed once even when both times are in range', () => {
      const qt = makeFlight({ id: 'qt', arrivalTime: onToday, departureTime: '2026-06-10T22:00:00Z' })
      expect(run(tz, now, [qt], 'today')).toEqual(['qt'])
    })
    it('falls back to actual times only when no scheduled time is set', () => {
      const actualOnly = makeFlight({
        id: 'act',
        arrivalTime: undefined,
        departureTime: undefined,
        actualArrivalTime: onToday
      })
      expect(run(tz, now, [actualOnly], 'today')).toEqual(['act'])
      expect(run(tz, now, [actualOnly], 'tomorrow')).toEqual([]) // actuals still match their own day only
      const scheduledWins = makeFlight({
        id: 'sched',
        arrivalTime: onTomorrow,
        departureTime: undefined,
        actualArrivalTime: onToday
      })
      expect(run(tz, now, [scheduledWins], 'today')).toEqual([])
    })
    it('a flight with no times at all is hidden by a day filter and kept by all', () => {
      const none = makeFlight({ id: 'none', arrivalTime: undefined, departureTime: undefined })
      expect(run(tz, now, [none], 'today')).toEqual([])
      expect(run(tz, now, [none], 'all')).toEqual(['none'])
    })
  })
})

// B43: aircraft on the ramp show on every day of their stay (scheduled overlap rule).
describe('filterFlights stay overlap (B43)', () => {
  const ids = (list: Flight[]) => list.map((f) => f.id)
  const run = (
    tz: string,
    now: () => Date,
    flights: Flight[],
    dateRange: FlightFilters['dateRange']
  ) => withTz(tz, () => ids(filterFlights(flights, { ...noFilters, dateRange }, now())))
  const stay = (id: string, arrivalTime?: string, departureTime?: string) =>
    makeFlight({ id, arrivalTime, departureTime })

  describe('Phoenix (UTC-7, no DST)', () => {
    const tz = 'America/Phoenix'
    // Mon Jun 8 .. Wed Jun 10 local
    const mon = new Date(2026, 5, 8, 12)
    const tue = () => new Date(2026, 5, 9, 12)
    const wed = () => new Date(2026, 5, 10, 12)
    const thu = () => new Date(2026, 5, 11, 12)
    const sun = () => new Date(2026, 5, 7, 12)
    const monToWed = stay('stay', '2026-06-08T17:00:00Z', '2026-06-10T19:00:00Z')

    it('arrives Mon, leaves Wed: shows Mon, Tue and Wed, not Sun or Thu', () => {
      expect(run(tz, () => mon, [monToWed], 'today')).toEqual(['stay'])
      expect(run(tz, tue, [monToWed], 'today')).toEqual(['stay'])
      expect(run(tz, wed, [monToWed], 'today')).toEqual(['stay'])
      expect(run(tz, sun, [monToWed], 'today')).toEqual([])
      expect(run(tz, thu, [monToWed], 'today')).toEqual([])
    })
    it('shows tomorrow when "today" is the day before the departure', () => {
      expect(run(tz, tue, [monToWed], 'tomorrow')).toEqual(['stay'])
      expect(run(tz, wed, [monToWed], 'tomorrow')).toEqual([])
    })
    it('a stay that spans the whole week (arrived last week, leaves next week) shows in week', () => {
      const long = stay('long', '2026-06-02T17:00:00Z', '2026-06-18T17:00:00Z')
      expect(run(tz, tue, [long], 'week')).toEqual(['long'])
      expect(run(tz, tue, [long], 'today')).toEqual(['long'])
    })
    it('arrival-only (null departure) shows on and after arrival day, not before', () => {
      const a = stay('a', '2026-06-08T17:00:00Z')
      expect(run(tz, tue, [a], 'today')).toEqual(['a'])
      expect(run(tz, sun, [a], 'today')).toEqual([])
    })
    it('departure-only matches only its departure day', () => {
      const d = stay('d', undefined, '2026-06-10T19:00:00Z')
      expect(run(tz, tue, [d], 'today')).toEqual([])
      expect(run(tz, wed, [d], 'today')).toEqual(['d'])
      expect(run(tz, thu, [d], 'today')).toEqual([])
    })
    it('midnight edges: arrival at the next day 00:00 local is not today; departure at 00:00 local is today', () => {
      // Jun 9 local = [2026-06-09T07:00Z, 2026-06-10T07:00Z)
      const arrivesAtEnd = stay('arrEnd', '2026-06-10T07:00:00Z', '2026-06-12T07:00:00Z')
      const arrivesLastMinute = stay('arrLast', '2026-06-10T06:59:00Z', '2026-06-12T07:00:00Z')
      const departsAtStart = stay('depStart', '2026-06-07T07:00:00Z', '2026-06-09T07:00:00Z')
      const departsJustBefore = stay('depBefore', '2026-06-07T07:00:00Z', '2026-06-09T06:59:00Z')
      expect(
        run(tz, tue, [arrivesAtEnd, arrivesLastMinute, departsAtStart, departsJustBefore], 'today')
      ).toEqual(['arrLast', 'depStart'])
    })
    it('quick turn within one day still shows once and only on that day', () => {
      const qt = stay('qt', '2026-06-09T17:00:00Z', '2026-06-09T19:00:00Z')
      expect(run(tz, tue, [qt], 'today')).toEqual(['qt'])
      expect(run(tz, wed, [qt], 'today')).toEqual([])
    })
    it('all still applies no date filter', () => {
      expect(run(tz, tue, [monToWed], 'all')).toEqual(['stay'])
    })
  })

  describe('New York (DST)', () => {
    const tz = 'America/New_York'
    it('spring-forward (Mar 8 2026, 23 h): stay Mar 7 -> Mar 9 shows on Mar 8 and its edges follow local midnight', () => {
      const now = () => new Date(2026, 2, 8, 12)
      // Mar 8 local = [05:00Z, Mar 9 04:00Z)
      const across = stay('across', '2026-03-07T15:00:00Z', '2026-03-09T15:00:00Z')
      const leavesAtStart = stay('leavesAtStart', '2026-03-07T15:00:00Z', '2026-03-08T05:00:00Z')
      const leavesBefore = stay('leavesBefore', '2026-03-07T15:00:00Z', '2026-03-08T04:59:00Z')
      const arrivesAtEnd = stay('arrivesAtEnd', '2026-03-09T04:00:00Z', '2026-03-10T15:00:00Z')
      const arrivesLast = stay('arrivesLast', '2026-03-09T03:59:00Z', '2026-03-10T15:00:00Z')
      expect(
        run(tz, now, [across, leavesAtStart, leavesBefore, arrivesAtEnd, arrivesLast], 'today')
      ).toEqual(['across', 'leavesAtStart', 'arrivesLast'])
    })
    it('fall-back (Nov 1 2026, 25 h): a stay arriving in the repeated hour and leaving Nov 3 shows Nov 1 and Nov 2', () => {
      const nov1 = () => new Date(2026, 10, 1, 12)
      const nov2 = () => new Date(2026, 10, 2, 12)
      const nov3 = () => new Date(2026, 10, 3, 12)
      const nov4 = () => new Date(2026, 10, 4, 12)
      // Nov 1 local = [04:00Z, Nov 2 05:00Z); Nov 3 local = [Nov 3 05:00Z, Nov 4 05:00Z)
      const s = stay('s', '2026-11-01T06:30:00Z', '2026-11-03T15:00:00Z')
      expect(run(tz, nov1, [s], 'today')).toEqual(['s'])
      expect(run(tz, nov2, [s], 'today')).toEqual(['s'])
      expect(run(tz, nov3, [s], 'today')).toEqual(['s'])
      expect(run(tz, nov4, [s], 'today')).toEqual([])
      // arrival exactly at the start of Nov 2 local (05:00Z) is not Nov 1
      const lateArrival = stay('late', '2026-11-02T05:00:00Z', '2026-11-03T15:00:00Z')
      expect(run(tz, nov1, [lateArrival], 'today')).toEqual([])
      expect(run(tz, nov2, [lateArrival], 'today')).toEqual(['late'])
    })
  })
})

// B43b / D13: Today + Future is open-ended; hidden flights (hidden_at passed) leave the board unless Show hidden.
describe('filterFlights Today + Future and hidden (B43b)', () => {
  const ids = (list: Flight[]) => list.map((f) => f.id)
  const tz = 'America/Phoenix'
  const now = () => new Date(2026, 5, 10, 13, 30) // Wed Jun 10 local; local Jun 10 = [06-10T07:00Z, 06-11T07:00Z)
  const run = (flights: Flight[], filters: Partial<FlightFilters>) =>
    withTz(tz, () => ids(filterFlights(flights, { ...noFilters, dateRange: 'today_future', ...filters }, now())))
  const stay = (id: string, arrivalTime?: string, departureTime?: string, extra: Partial<Flight> = {}) =>
    makeFlight({ id, arrivalTime, departureTime, ...extra })

  describe('Today + Future', () => {
    it('keeps every flight whose stay ends today or later, with no upper bound', () => {
      const flights = [
        stay('leftYesterday', '2026-06-08T17:00:00Z', '2026-06-10T06:59:00Z'), // departed Jun 9 23:59 local
        stay('leavesTodayStart', '2026-06-08T17:00:00Z', '2026-06-10T07:00:00Z'), // Jun 10 00:00 local
        stay('today', '2026-06-10T17:00:00Z', '2026-06-10T19:00:00Z'),
        stay('tomorrow', '2026-06-11T17:00:00Z', '2026-06-11T19:00:00Z'),
        stay('farFuture', '2027-03-01T17:00:00Z', '2027-03-02T19:00:00Z'),
        stay('arrivalOnly', '2026-06-01T17:00:00Z'),
        stay('departureOnlyFuture', undefined, '2026-09-01T17:00:00Z'),
        stay('departureOnlyPast', undefined, '2026-06-09T17:00:00Z'),
      ]
      expect(run(flights, {})).toEqual([
        'leavesTodayStart', 'today', 'tomorrow', 'farFuture', 'arrivalOnly', 'departureOnlyFuture',
      ])
    })
    it('is a superset of Today and Tomorrow for the same flights', () => {
      const flights = [
        stay('today', '2026-06-10T17:00:00Z', '2026-06-10T19:00:00Z'),
        stay('tomorrow', '2026-06-11T17:00:00Z', '2026-06-11T19:00:00Z'),
      ]
      expect(run(flights, { dateRange: 'today' })).toEqual(['today'])
      expect(run(flights, { dateRange: 'tomorrow' })).toEqual(['tomorrow'])
      expect(run(flights, {})).toEqual(['today', 'tomorrow'])
    })
    it('dateRangeBounds starts at local midnight today and has no end', () => {
      withTz(tz, () => {
        const bounds = dateRangeBounds('today_future', now())
        expect(bounds?.start.getTime()).toBe(new Date('2026-06-10T07:00:00Z').getTime())
        expect(bounds?.end).toBeNull()
      })
    })
    it('listFetchWindow has a start date but no end date', () => {
      withTz(tz, () => {
        expect(listFetchWindow(now(), 'today_future')).toEqual({ startDate: '2026-06-07' })
        expect(listFetchWindow(now(), 'today')).toEqual({ startDate: '2026-06-07', endDate: '2026-06-24' })
      })
    })
  })

  describe('hidden', () => {
    const visible = stay('visible', '2026-06-10T17:00:00Z', '2026-06-10T19:00:00Z')
    const hiddenByHand = stay('hand', '2026-06-10T17:00:00Z', '2026-06-10T19:00:00Z', {
      hiddenAt: '2026-06-10T18:00:00Z', // before "now" (Jun 10 20:30Z)
    })
    // Departed today: hidden_at is the start of tomorrow (local), still in the future
    const departedToday = stay('departedToday', '2026-06-10T10:00:00Z', '2026-06-10T15:00:00Z', {
      status: 'departed',
      hiddenAt: '2026-06-11T07:00:00Z',
    })
    // Departed yesterday: hidden_at is the start of today (local), already passed
    const departedYesterday = stay('departedYesterday', '2026-06-09T10:00:00Z', '2026-06-10T15:00:00Z', {
      status: 'departed',
      hiddenAt: '2026-06-10T07:00:00Z',
    })
    const all = [visible, hiddenByHand, departedToday, departedYesterday]

    it('isFlightHidden is true only once hidden_at has passed', () => {
      expect(isFlightHidden(visible, now())).toBe(false)
      expect(isFlightHidden(hiddenByHand, now())).toBe(true)
      expect(isFlightHidden(departedToday, now())).toBe(false)
      expect(isFlightHidden(departedYesterday, now())).toBe(true)
      // exactly at hidden_at counts as hidden (matches the repo's hidden_at.gt.now keep-rule)
      expect(isFlightHidden({ hiddenAt: '2026-06-10T20:30:00Z' }, new Date('2026-06-10T20:30:00Z'))).toBe(true)
    })
    it('hides flights by default; a departed flight stays on its departure day and drops off the next', () => {
      expect(run(all, {})).toEqual(['visible', 'departedToday'])
      const tomorrow = () => new Date(2026, 5, 11, 9, 0)
      withTz(tz, () => {
        expect(ids(filterFlights(all, { ...noFilters, dateRange: 'all' }, tomorrow()))).toEqual(['visible'])
      })
    })
    it('Show hidden lists every flight, hidden ones included', () => {
      expect(run(all, { showHidden: true })).toEqual(['visible', 'hand', 'departedToday', 'departedYesterday'])
    })
    it('hidden is applied together with the other filters', () => {
      expect(run(all, { showHidden: true, status: 'departed' })).toEqual(['departedToday', 'departedYesterday'])
      expect(run(all, { status: 'departed' })).toEqual(['departedToday'])
    })
    it('Show hidden counts as an active filter and is cleared by clearActiveFilters', () => {
      const f: FlightFilters = { ...noFilters, dateRange: 'today_future', showHidden: true }
      expect(activeFilterParts(f)).toEqual(['showing hidden'])
      expect(hasActiveFilters(f)).toBe(true)
      expect(clearActiveFilters(f).showHidden).toBe(false)
      expect(hasActiveFilters(clearActiveFilters(f))).toBe(false)
    })
  })
})

describe('dateRangeBounds / listFetchWindow', () => {
  it('all has no bounds', () => {
    expect(dateRangeBounds('all', new Date())).toBeNull()
  })

  it('default window is yesterday..+14 days (local)', () => {
    withTz('America/Phoenix', () => {
      // Sun Jun 7: yesterday (Jun 6) is before the week start, so -1..+14 applies as is
      expect(listFetchWindow(new Date(2026, 5, 7, 12))).toEqual({
        startDate: '2026-06-06',
        endDate: '2026-06-21'
      })
    })
  })

  it('widens to the week start so the "week" filter is always inside the window', () => {
    withTz('America/Phoenix', () => {
      // Sat Jun 13: week starts Sun Jun 7, earlier than yesterday (Jun 12)
      expect(listFetchWindow(new Date(2026, 5, 13, 12))).toEqual({
        startDate: '2026-06-07',
        endDate: '2026-06-27'
      })
    })
  })

  it('tomorrow and the whole current week are always inside the window', () => {
    withTz('America/New_York', () => {
      for (let day = 1; day <= 30; day++) {
        const now = new Date(2026, 2, day, 12)
        const { startDate, endDate } = listFetchWindow(now)
        const week = weekDateParams(now, 0)
        expect(startDate <= week.startDate).toBe(true)
        expect((endDate as string) >= week.endDate).toBe(true)
      }
    })
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

  // weekRange is local-calendar by design (F5): the same instant falls in different weeks per zone
  it('follows the local zone: the same instant falls in different weeks in different zones', () => {
    const instant = new Date('2026-06-14T03:00:00Z') // Sun 03:00Z
    process.env.TZ = 'UTC'
    const utcStart = weekRange(instant, 0).start.toISOString()
    process.env.TZ = 'America/New_York' // still Sat 23:00 local
    const nyStart = weekRange(instant, 0).start.toISOString()
    expect(utcStart).not.toBe(nyStart)
  })
})

describe('weekDateParams (F5: calendar window follows weekOffset in local dates)', () => {
  it('current week: Sunday..Saturday as local date strings', () => {
    withTz('America/Phoenix', () => {
      // Wed 2026-03-11 12:00 local
      expect(weekDateParams(new Date(2026, 2, 11, 12), 0)).toEqual({
        startDate: '2026-03-08',
        endDate: '2026-03-14',
      })
    })
  })

  it('moves by whole weeks, far beyond the old fixed +-28 days window', () => {
    withTz('America/Phoenix', () => {
      const now = new Date(2026, 2, 11, 12)
      expect(weekDateParams(now, 6)).toEqual({ startDate: '2026-04-19', endDate: '2026-04-25' })
      expect(weekDateParams(now, -10)).toEqual({ startDate: '2025-12-28', endDate: '2026-01-03' })
    })
  })

  it('uses the LOCAL date near midnight, not the UTC date (Phoenix Sat 23:30 is Sun in UTC)', () => {
    withTz('America/Phoenix', () => {
      const satNight = new Date(2026, 2, 14, 23, 30) // Sat Mar 14 23:30 MST = Sun 06:30Z
      expect(weekDateParams(satNight, 0).startDate).toBe('2026-03-08')
    })
  })

  it('weeks spanning Denver DST change stay Sunday..Saturday', () => {
    withTz('America/Denver', () => {
      expect(weekDateParams(new Date(2026, 2, 4, 12), 1)).toEqual({
        startDate: '2026-03-08',
        endDate: '2026-03-14',
      })
      expect(weekDateParams(new Date(2026, 10, 1, 12), 0)).toEqual({
        startDate: '2026-11-01',
        endDate: '2026-11-07',
      })
    })
  })

  it('week-view route and calendar agree: both derive from weekRange', () => {
    withTz('America/Denver', () => {
      const now = new Date(2026, 2, 11, 12)
      for (const off of [-3, 0, 5]) {
        const { start } = weekRange(now, off)
        expect(weekDateParams(now, off).startDate).toBe(
          `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
        )
      }
    })
  })
})

describe('linkedFlightIds', () => {
  const quickTurn = makeFlight({ id: 'qt' })
  const stay = makeFlight({ id: 'stay', isQuickTurn: false, departureTime: '2026-03-12T15:00:00Z' })
  const arrivalOnly = makeFlight({ id: 'arr', departureTime: undefined })
  const departureOnly = makeFlight({ id: 'dep', arrivalTime: undefined })

  it('links a flight that is in both columns (quick turn or stay), by id', () => {
    const { arrivals, departures } = partitionFlights([quickTurn, stay, arrivalOnly, departureOnly])
    expect([...linkedFlightIds(arrivals, departures)].sort()).toEqual(['qt', 'stay'])
  })

  it('does not link flights shown in one column only', () => {
    const { arrivals, departures } = partitionFlights([arrivalOnly, departureOnly])
    expect(linkedFlightIds(arrivals, departures).size).toBe(0)
  })

  it('links nothing when a column is empty (e.g. arrivals-only view of departure-only data)', () => {
    expect(linkedFlightIds([quickTurn], []).size).toBe(0)
  })
})

describe('assignLinkColors', () => {
  it('gives each linked flight one color, looked up by id so both cards match', () => {
    const colors = assignLinkColors(new Set(['a', 'b']))
    expect(colors.get('a')).toBe(LINK_COLORS[0])
    expect(colors.get('b')).toBe(LINK_COLORS[1])
    expect(colors.get('other')).toBeUndefined()
  })

  it('rotates through the palette when there are more flights than colors', () => {
    const ids = Array.from({ length: LINK_COLORS.length + 1 }, (_, i) => `f${i}`)
    const colors = assignLinkColors(new Set(ids))
    expect(colors.get(`f${LINK_COLORS.length}`)).toBe(LINK_COLORS[0])
  })

  it('palette entries are distinct and use full literal classes for each part', () => {
    expect(new Set(LINK_COLORS.map((c) => c.border)).size).toBe(LINK_COLORS.length)
    for (const c of LINK_COLORS) {
      expect(c.border).toMatch(/^border-l-\w+-500\/60$/)
      expect(c.ring).toMatch(/^ring-\w+-500$/)
      expect(c.tint).toMatch(/^bg-\w+-500\/20$/)
      expect(c.text).toMatch(/^text-\w+-500$/)
    }
  })
})

describe('empty state (B18)', () => {
  const today: FlightFilters = { search: '', status: 'all', dateRange: 'today', services: [], showHidden: false }

  it('lists each active filter, status first, then search, then services', () => {
    expect(activeFilterParts(today)).toEqual([])
    expect(
      activeFilterParts({ ...today, status: 'arrived', search: 'N12' })
    ).toEqual(['status = Arrived', "search 'N12'"])
    expect(
      activeFilterParts({ ...today, services: ['fuel', 'ground_transport'] })
    ).toEqual(['services = Fuel, Ground Transport'])
  })

  it('does not count the date range as a filter', () => {
    expect(hasActiveFilters({ ...today, dateRange: 'week' })).toBe(false)
    expect(hasActiveFilters({ ...today, search: 'x' })).toBe(true)
  })

  it('clearActiveFilters resets search/status/services but keeps the date range', () => {
    expect(
      clearActiveFilters({
        search: 'N12',
        status: 'arrived',
        dateRange: 'tomorrow',
        services: ['fuel'],
        showHidden: true,
      })
    ).toEqual({ search: '', status: 'all', dateRange: 'tomorrow', services: [], showHidden: false })
  })

  it('explains the filters when they emptied a list that has flights for the day', () => {
    expect(
      emptyStateMessage('arrivals', { ...today, status: 'arrived', search: 'N12' }, 3)
    ).toEqual({
      title: "No arrivals match: status = Arrived, search 'N12'",
      filtered: true,
    })
  })

  it('reports a truly empty day or week when the date range alone leaves nothing', () => {
    expect(emptyStateMessage('departures', today, 0)).toEqual({
      title: 'No departures today',
      filtered: false,
    })
    // Filters are active but the day is empty anyway: say so rather than blaming the filters.
    expect(
      emptyStateMessage('arrivals', { ...today, search: 'N12', dateRange: 'week' }, 0)
    ).toEqual({ title: 'No arrivals this week', filtered: false })
    expect(emptyStateMessage('flights', { ...today, dateRange: 'tomorrow' }, 0).title).toBe(
      'No flights tomorrow'
    )
    expect(emptyStateMessage('flights', { ...today, dateRange: 'all' }, 0).title).toBe(
      'No flights found'
    )
    expect(emptyStateMessage('flights', { ...today, dateRange: 'today_future' }, 0).title).toBe(
      'No flights today or later'
    )
  })
})

describe('flightradarUrl', () => {
  it('links the lower-cased registration to its Flightradar24 aircraft page', () => {
    expect(flightradarUrl(' N868CB ')).toBe(
      'https://www.flightradar24.com/data/aircraft/n868cb'
    )
  })
})
