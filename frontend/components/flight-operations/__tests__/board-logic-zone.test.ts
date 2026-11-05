import { withTz } from '@/tests/support/with-tz'
import { describe, expect, it } from 'vitest'
import {
  dateRangeBounds,
  filterFlights,
  listFetchWindow,
  weekDateParams,
  weekRange
} from '../board-logic'
import type { Flight, FlightFilters } from '../types'

const DEN = 'America/Denver'

function flight(id: string, arrival: string, departure: string): Flight {
  return {
    id,
    tailNumber: `N${id}`,
    aircraftType: 'C172',
    arrivalTime: arrival,
    departureTime: departure,
    isQuickTurn: false,
    type: 'arrival',
    status: 'scheduled',
    services: []
  } as unknown as Flight
}

const filters = (dateRange: FlightFilters['dateRange']): FlightFilters => ({
  search: '',
  status: 'all',
  dateRange,
  services: [],
  showHidden: false
})

describe('weekRange / weekDateParams in a zone', () => {
  it('ordinary week, Denver, from a browser in Tokyo', () => {
    withTz('Asia/Tokyo', () => {
      // Thu Mar 5 2026 12:00 MST
      const now = new Date('2026-03-05T19:00:00Z')
      const w = weekRange(now, 0, DEN)
      expect(w.start.toISOString()).toBe('2026-03-01T07:00:00.000Z')
      expect(w.end.toISOString()).toBe('2026-03-08T07:00:00.000Z')
      expect(weekDateParams(now, 0, DEN)).toEqual({ startDate: '2026-03-01', endDate: '2026-03-07' })
    })
  })
  it('the spring-forward week (Mar 8) is 167 h but still 7 days', () => {
    const w = weekRange(new Date('2026-03-10T18:00:00Z'), 0, DEN)
    expect(w.start.toISOString()).toBe('2026-03-08T07:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-03-15T06:00:00.000Z')
  })
  it('the fall-back week (Nov 1) is 169 h', () => {
    const w = weekRange(new Date('2026-11-04T18:00:00Z'), 0, DEN)
    expect(w.start.toISOString()).toBe('2026-11-01T06:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-11-08T07:00:00.000Z')
  })
  it('week offsets shift by whole days; Zulu week starts Sunday 00:00Z', () => {
    const now = new Date('2026-03-05T19:00:00Z')
    expect(weekDateParams(now, 1, DEN)).toEqual({ startDate: '2026-03-08', endDate: '2026-03-14' })
    expect(weekDateParams(now, -1, 'UTC')).toEqual({ startDate: '2026-02-22', endDate: '2026-02-28' })
    expect(weekRange(now, 0, 'UTC').start.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })
  it('around midnight the zone decides the week: Sat 23:30 MST is already Sunday in Zulu', () => {
    const now = new Date('2026-03-08T06:30:00Z') // Sat Mar 7 23:30 MST, Sun Mar 8 06:30Z
    expect(weekDateParams(now, 0, DEN).startDate).toBe('2026-03-01')
    expect(weekDateParams(now, 0, 'UTC').startDate).toBe('2026-03-08')
  })
  it('no zone keeps browser-local weeks', () => {
    withTz('America/Phoenix', () => {
      const w = weekRange(new Date('2026-03-05T19:00:00Z'), 0)
      expect(w.start.toISOString()).toBe('2026-03-01T07:00:00.000Z')
    })
  })
})

describe('dateRangeBounds / listFetchWindow in a zone', () => {
  it('today and tomorrow are Denver days', () => {
    const now = new Date('2026-03-08T05:00:00Z') // Sat Mar 7 22:00 MST
    expect(dateRangeBounds('today', now, DEN)).toEqual({
      start: new Date('2026-03-07T07:00:00Z'),
      end: new Date('2026-03-08T07:00:00Z')
    })
    expect(dateRangeBounds('tomorrow', now, DEN)).toEqual({
      start: new Date('2026-03-08T07:00:00Z'),
      end: new Date('2026-03-09T06:00:00Z') // the 23 h day
    })
    expect(dateRangeBounds('today_future', now, DEN)?.end).toBeNull()
    expect(dateRangeBounds('all', now, DEN)).toBeNull()
  })
  it('the same instant is a different day in Zulu', () => {
    const now = new Date('2026-03-08T05:00:00Z')
    expect(dateRangeBounds('today', now, 'UTC')?.start.toISOString()).toBe('2026-03-08T00:00:00.000Z')
  })
  it('fetch window dates are zone dates', () => {
    const now = new Date('2026-03-08T05:00:00Z') // Mar 7 in Denver, Mar 8 in Zulu
    expect(listFetchWindow(now, 'today', DEN)).toEqual({ startDate: '2026-03-01', endDate: '2026-03-21' })
    expect(listFetchWindow(now, 'today', 'UTC')).toEqual({ startDate: '2026-03-07', endDate: '2026-03-22' })
    expect(listFetchWindow(now, 'today_future', DEN)).toEqual({ startDate: '2026-03-01' })
  })
})

describe('filterFlights follows the zone', () => {
  // 02:00Z Mar 8 is Sat Mar 7 19:00 MST: "today" in Denver, but the Zulu day Mar 8.
  const late = flight('1', '2026-03-08T02:00:00Z', '2026-03-08T03:00:00Z')
  const now = new Date('2026-03-07T20:00:00Z') // Sat Mar 7 13:00 MST, 20:00Z
  it('Today in Denver includes it; Today in Zulu (Mar 7 UTC) does not', () => {
    expect(filterFlights([late], filters('today'), now, DEN)).toHaveLength(1)
    expect(filterFlights([late], filters('today'), now, 'UTC')).toHaveLength(0)
  })
  it('Tomorrow in Zulu includes it', () => {
    expect(filterFlights([late], filters('tomorrow'), now, 'UTC')).toHaveLength(1)
    expect(filterFlights([late], filters('tomorrow'), now, DEN)).toHaveLength(0)
  })
  it('midnight edge: a flight at exactly local midnight belongs to the new day', () => {
    const f = flight('2', '2026-03-08T07:00:00Z', '2026-03-08T07:30:00Z') // Sun 00:00 MST
    const sat = new Date('2026-03-07T20:00:00Z')
    expect(filterFlights([f], filters('today'), sat, DEN)).toHaveLength(0)
    expect(filterFlights([f], filters('tomorrow'), sat, DEN)).toHaveLength(1)
  })
  it('Week uses the zone week', () => {
    const f = flight('3', '2026-03-08T07:30:00Z', '2026-03-08T08:00:00Z') // Sun Mar 8 00:30 MST
    const satNight = new Date('2026-03-08T06:30:00Z') // Sat Mar 7 23:30 MST
    expect(filterFlights([f], filters('week'), satNight, DEN)).toHaveLength(0) // next week in Denver
    expect(filterFlights([f], filters('week'), satNight, 'UTC')).toHaveLength(1) // Sunday already in Zulu
  })
})
