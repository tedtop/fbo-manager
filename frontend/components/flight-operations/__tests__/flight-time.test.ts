import { describe, expect, it } from 'vitest'
import {
  addMinutesToTime,
  applyArrivalChange,
  applyDepartureChange,
  applyQuickTurnChange,
  buildTimestamp,
  isQuickTurnSaved,
  quickTurnDeparture,
  validateScheduledTimes,
  type ScheduledTimesState,
} from '../flight-time'

const blank: ScheduledTimesState = { arrival: '', departure: '', quickTurn: true }

describe('quickTurnDeparture', () => {
  it('is arrival + 1 hour', () => {
    expect(quickTurnDeparture('09:15')).toBe('10:15')
  })
  it('wraps past midnight', () => {
    expect(quickTurnDeparture('23:30')).toBe('00:30')
  })
  it('is blank without an arrival', () => {
    expect(quickTurnDeparture('')).toBe('')
  })
})

describe('addMinutesToTime', () => {
  it('handles negative offsets and unparsable input', () => {
    expect(addMinutesToTime('00:10', -30)).toBe('23:40')
    expect(addMinutesToTime('nope', 5)).toBe('')
  })
})

describe('QT state transitions', () => {
  it('QT on: typing an arrival sets departure = arrival + 1 h', () => {
    expect(applyArrivalChange(blank, '14:30')).toEqual({
      arrival: '14:30',
      departure: '15:30',
      quickTurn: true,
    })
  })

  it('QT on: departure follows later arrival edits', () => {
    const first = applyArrivalChange(blank, '14:30')
    expect(applyArrivalChange(first, '16:00').departure).toBe('17:00')
  })

  it('QT on: clearing the arrival clears the computed departure', () => {
    const first = applyArrivalChange(blank, '14:30')
    expect(applyArrivalChange(first, '').departure).toBe('')
  })

  it('editing departure clears QT and keeps the typed value', () => {
    const first = applyArrivalChange(blank, '14:30')
    expect(applyDepartureChange(first, '18:00')).toEqual({
      arrival: '14:30',
      departure: '18:00',
      quickTurn: false,
    })
  })

  it('QT off: arrival edits no longer move departure', () => {
    const off = applyDepartureChange(applyArrivalChange(blank, '14:30'), '18:00')
    expect(applyArrivalChange(off, '15:00').departure).toBe('18:00')
  })

  it('re-checking QT recomputes departure from arrival', () => {
    const off = applyDepartureChange(applyArrivalChange(blank, '14:30'), '18:00')
    expect(applyQuickTurnChange(off, true)).toEqual({
      arrival: '14:30',
      departure: '15:30',
      quickTurn: true,
    })
  })

  it('checking QT with no arrival keeps the departure; unchecking keeps times', () => {
    const dep = { arrival: '', departure: '08:00', quickTurn: false }
    expect(applyQuickTurnChange(dep, true).departure).toBe('08:00')
    const qt = applyArrivalChange(blank, '14:30')
    expect(applyQuickTurnChange(qt, false)).toEqual({
      arrival: '14:30',
      departure: '15:30',
      quickTurn: false,
    })
  })
})

describe('validateScheduledTimes', () => {
  it('rejects both blank', () => {
    expect(validateScheduledTimes('', '')).toMatch(/arrival/i)
  })
  it.each([
    ['09:00', ''],
    ['', '09:00'],
    ['09:00', '10:00'],
  ])('accepts arrival=%j departure=%j', (a, d) => {
    expect(validateScheduledTimes(a, d)).toBeNull()
  })
})

describe('isQuickTurnSaved', () => {
  it('needs QT on and both times', () => {
    expect(isQuickTurnSaved({ arrival: '09:00', departure: '10:00', quickTurn: true })).toBe(true)
    expect(isQuickTurnSaved({ arrival: '', departure: '10:00', quickTurn: true })).toBe(false)
    expect(isQuickTurnSaved({ arrival: '09:00', departure: '', quickTurn: true })).toBe(false)
    expect(isQuickTurnSaved({ arrival: '09:00', departure: '10:00', quickTurn: false })).toBe(false)
  })
})

describe('buildTimestamp', () => {
  it('is undefined for a blank time (no fabricated +45 min)', () => {
    expect(buildTimestamp('2026-03-10', '')).toBeUndefined()
  })
  it('joins date and time', () => {
    expect(buildTimestamp('2026-03-10', '14:30')).toBe('2026-03-10T14:30:00')
  })
  it('rolls to the next day when the time is before the preceding one', () => {
    expect(buildTimestamp('2026-03-10', '00:30', '23:30')).toBe('2026-03-11T00:30:00')
    expect(buildTimestamp('2026-12-31', '00:30', '23:30')).toBe('2027-01-01T00:30:00')
  })
  it('stays on the same day otherwise', () => {
    expect(buildTimestamp('2026-03-10', '15:30', '14:30')).toBe('2026-03-10T15:30:00')
  })
})
