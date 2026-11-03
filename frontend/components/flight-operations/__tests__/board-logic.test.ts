import { withTz } from '@/tests/support/with-tz'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dateRangeBounds, filterFlights, listFetchWindow, partitionFlights, weekDateParams, weekRange } from '../board-logic'
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

    it('arrival-only flight matches on its arrival day', () => {
      expect(run(tz, now, [arr('a', onToday)], 'today')).toEqual(['a'])
      expect(run(tz, now, [arr('a', onToday)], 'tomorrow')).toEqual([])
    })
    it('departure-only flight matches on its departure day', () => {
      expect(run(tz, now, [dep('d', onTomorrow)], 'tomorrow')).toEqual(['d'])
      expect(run(tz, now, [dep('d', onTomorrow)], 'today')).toEqual([])
    })
    it('multi-day stay matches on its arrival day and its departure day, not the days between', () => {
      const stay = makeFlight({
        id: 'stay',
        arrivalTime: onToday,
        departureTime: '2026-06-12T20:00:00Z'
      })
      expect(run(tz, now, [stay], 'today')).toEqual(['stay']) // arrival day
      expect(run(tz, now, [stay], 'tomorrow')).toEqual([]) // in between
      const later = () => new Date(2026, 5, 12, 12)
      expect(run(tz, later, [stay], 'today')).toEqual(['stay']) // departure day
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
      expect(run(tz, now, [actualOnly], 'tomorrow')).toEqual([])
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
        expect(endDate >= week.endDate).toBe(true)
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
