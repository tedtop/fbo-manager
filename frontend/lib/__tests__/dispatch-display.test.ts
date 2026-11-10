import { describe, expect, it } from 'vitest'
import {
  CHANGE_RETENTION_MS,
  type DispatchChanges,
  type DispatchSnapshot,
  countdownMinutes,
  detectDispatchChanges,
  formatCountdown,
  formatElapsedSince,
  formatMinutes,
  gateLabel,
  parseQtDate,
  urgencyClass
} from '../dispatch-display'
import { summarizeAircraft } from '../flight-track'
import { historyRows } from '../dispatch-history'
import { altitudes, ceilingFromClouds, formatIsoTimeOfDay, windCompass } from '../weather'
import type { QTDispatch } from '@/types/qt-dispatch'

const flight = (over: Partial<QTDispatch> = {}): QTDispatch => ({
  FlightID: 'F1',
  TransactionID: 'T1',
  FlightNumber: 'UA1026',
  TailNumber: 'N17448',
  AirlineName: 'United',
  Destination: 'DEN',
  FlightStatus: 'Planned',
  Quantity: 1000,
  QuantityInWeight: 6700,
  Gate: 'A4',
  TerminalNumber: 'A',
  DepartureDate: '2026-11-08 14:00',
  ArrivalDate: '2026-11-08 13:00',
  ...over
})

describe('dates and countdowns', () => {
  it('treats QT null dates as missing', () => {
    expect(parseQtDate('0001-01-01 00:00')).toBeNull()
    expect(parseQtDate(undefined)).toBeNull()
    expect(formatCountdown('0001-01-01 00:00')).toBe('N/A')
  })

  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(135)).toBe('2h 15m')
  })

  it('counts down, then reports overdue, with "any moment" around zero', () => {
    const now = new Date('2026-11-08T12:00:00').getTime()
    expect(formatCountdown('2026-11-08 12:30', now)).toBe('in 30m')
    expect(formatCountdown('2026-11-08 12:01', now)).toBe('any moment')
    expect(formatCountdown('2026-11-08 11:00', now)).toBe('overdue by 1h 0m')
    expect(countdownMinutes('2026-11-08 12:30', now)).toBe(30)
    expect(formatElapsedSince('2026-11-08 11:40', now)).toBe('20m')
    expect(formatElapsedSince('2026-11-08 12:00', now)).toBe('just in')
  })

  it('ramps urgency at 45 and 15 minutes, and when overdue', () => {
    expect(urgencyClass(null)).toBe('')
    expect(urgencyClass(120)).toBe('')
    expect(urgencyClass(45)).toBe('fd-urgency-warn')
    expect(urgencyClass(15)).toBe('fd-urgency-critical')
    expect(urgencyClass(-30)).toBe('fd-urgency-critical')
  })
})

describe('gateLabel', () => {
  it('joins terminal and gate, or shows the bare gate for QT placeholder terminals', () => {
    expect(gateLabel({ Gate: '4', TerminalNumber: 'A' })).toBe('A4')
    expect(gateLabel({ Gate: '4', TerminalNumber: '0' })).toBe('4')
    expect(gateLabel({ Gate: '4', TerminalNumber: '-' })).toBe('4')
    expect(gateLabel({ Gate: '?', TerminalNumber: 'A' })).toBeNull()
    expect(gateLabel({ Gate: '', TerminalNumber: 'A' })).toBeNull()
  })
})

describe('detectDispatchChanges', () => {
  const run = (polls: { dispatches: QTDispatch[]; now: number }[]) => {
    const snapshots = new Map<string, DispatchSnapshot>()
    const changes = new Map<string, DispatchChanges>()
    for (const p of polls) detectDispatchChanges(p.dispatches, snapshots, changes, p.now)
    return changes
  }

  it('flags nothing on first sighting', () => {
    expect(run([{ dispatches: [flight()], now: 0 }]).size).toBe(0)
  })

  it('keeps every fuel transition, oldest first, keyed by FlightID across new TransactionIDs', () => {
    const c = run([
      { dispatches: [flight()], now: 0 },
      { dispatches: [flight({ TransactionID: 'T2', QuantityInWeight: 8000 })], now: 1000 },
      { dispatches: [flight({ TransactionID: 'T3', QuantityInWeight: 7000 })], now: 2000 }
    ]).get('F1')
    expect(c?.fuel.map((f) => [f.oldValue, f.newValue, f.increased])).toEqual([
      [6700, 8000, true],
      [8000, 7000, false]
    ])
  })

  it('ignores fuel changes while the quantity was still zero', () => {
    const c = run([
      { dispatches: [flight({ QuantityInWeight: 0 })], now: 0 },
      { dispatches: [flight({ QuantityInWeight: 5000 })], now: 1000 }
    ])
    expect(c.size).toBe(0)
  })

  it('flags gate changes only between two known gates', () => {
    const c = run([
      { dispatches: [flight({ Gate: '?' })], now: 0 },
      { dispatches: [flight({ Gate: 'A4' })], now: 1000 },
      { dispatches: [flight({ Gate: 'B2' })], now: 2000 }
    ]).get('F1')
    expect(c?.gate).toHaveLength(1)
    expect(c?.gate[0]).toMatchObject({ oldValue: 'A4', newValue: 'B2' })
  })

  it('records a departure change instead of an arrival change in the same poll', () => {
    const c = run([
      { dispatches: [flight()], now: 0 },
      { dispatches: [flight({ DepartureDate: '2026-11-08 15:00', ArrivalDate: '2026-11-08 14:00' })], now: 1000 }
    ]).get('F1')
    expect(c?.time.map((t) => t.label)).toEqual(['Departure'])
  })

  it('drops changes once the flight completes or leaves the feed, and after 3 hours', () => {
    const base = [{ dispatches: [flight()], now: 0 }, { dispatches: [flight({ QuantityInWeight: 8000 })], now: 1000 }]
    expect(run(base).size).toBe(1)
    expect(run([...base, { dispatches: [flight({ QuantityInWeight: 8000, FlightStatus: 'Completed' })], now: 2000 }]).size).toBe(0)
    expect(run([...base, { dispatches: [], now: 2000 }]).size).toBe(0)
    expect(run([...base, { dispatches: [flight({ QuantityInWeight: 8000 })], now: 1000 + CHANGE_RETENTION_MS + 1 }]).size).toBe(0)
  })
})

describe('summarizeAircraft', () => {
  it('computes an ETA from distance and ground speed, and the transponder type', () => {
    expect(summarizeAircraft({ dst: 100, gs: 400, alt_baro: 20000, t: 'B39M' })).toEqual({
      distanceNm: 100,
      groundSpeedKt: 400,
      altitudeFt: 20000,
      onGround: false,
      etaMinutes: 15,
      equipmentCode: 'B39M'
    })
  })

  it('gives no ETA when parked, slow or on the ground', () => {
    expect(summarizeAircraft({ dst: 1, gs: 3, alt_baro: 'ground' })).toMatchObject({ onGround: true, etaMinutes: null })
    expect(summarizeAircraft({ dst: 100 })).toMatchObject({ etaMinutes: null, equipmentCode: null })
  })
})

describe('historyRows', () => {
  it('maps a dispatch to a fuel_dispatch_history row and nulls QT placeholders', () => {
    const [row] = historyRows([flight({ ArrivalDate: '0001-01-01 00:00', ChangeFlags: 3 })])
    expect(row).toMatchObject({
      transaction_id: 'T1',
      change_flags: 3,
      flight_number: 'UA1026',
      quantity_in_weight: 6700,
      arrival_date: null
    })
    expect(row.departure_date).toMatch(/^2026-11-08T/)
  })
})

describe('weather helpers', () => {
  it('formats compass, sun times and ceiling', () => {
    expect(windCompass(0)).toBe('N')
    expect(windCompass(270)).toBe('W')
    expect(formatIsoTimeOfDay('2026-06-13T05:41')).toBe('5:41 AM')
    expect(formatIsoTimeOfDay('2026-06-13T00:05')).toBe('12:05 AM')
    expect(ceilingFromClouds([{ cover: 'FEW', base: 2000 }, { cover: 'BKN', base: 4500 }])).toBe('4,500 ft BKN')
    expect(ceilingFromClouds([])).toBe('None')
  })

  it('derives pressure and density altitude from a METAR', () => {
    const a = altitudes({ altim: 1013.25, temp: 15, elev: 977 })
    expect(a?.altimeterInHg).toBeCloseTo(29.92, 1)
    expect(a?.pressureAltFt).toBeGreaterThan(3000)
    expect(altitudes({})).toBeNull()
  })
})
