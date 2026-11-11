import { describe, expect, it } from 'vitest'
import {
  addMinutesToTime,
  applyArrivalChange,
  applyDepartureChange,
  applyQuickTurnChange,
  buildTimestamp,
  convertFormZone,
  displayDates,
  formFromInstants,
  formatGroundTime,
  formTimestamps,
  toDateInput,
  toTimeInput,
  isQuickTurnSaved,
  quickTurnDeparture,
  validateScheduledTimes,
  type ScheduledTimesState,
} from '../flight-time'
import { withTz } from '@/tests/support/with-tz'

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

describe('buildTimestamp (real instants from LOCAL date + time)', () => {
  it('is undefined for a blank time (no fabricated +45 min)', () => {
    expect(buildTimestamp('2026-03-10', '')).toBeUndefined()
  })

  it('Phoenix (UTC-7, no DST): 14:30 local is 21:30Z', () => {
    withTz('America/Phoenix', () => {
      expect(buildTimestamp('2026-03-10', '14:30')).toBe('2026-03-10T21:30:00.000Z')
    })
  })

  it('UTC runtime: instant equals the wall-clock', () => {
    withTz('UTC', () => {
      expect(buildTimestamp('2026-03-10', '14:30')).toBe('2026-03-10T14:30:00.000Z')
    })
  })

  it('23:30 local stays on the entered local date (Phoenix: 06:30Z next UTC day)', () => {
    withTz('America/Phoenix', () => {
      const iso = buildTimestamp('2026-03-10', '23:30') as string
      expect(iso).toBe('2026-03-11T06:30:00.000Z')
      expect(toDateInput(iso)).toBe('2026-03-10')
      expect(toTimeInput(iso)).toBe('23:30')
    })
  })

  it('rolls to the next local day when the time is before the preceding one (QT 23:30 -> 00:30)', () => {
    withTz('America/Phoenix', () => {
      expect(buildTimestamp('2026-03-10', '00:30', '23:30')).toBe('2026-03-11T07:30:00.000Z')
      expect(buildTimestamp('2026-12-31', '00:30', '23:30')).toBe('2027-01-01T07:30:00.000Z')
    })
  })

  it('stays on the same day otherwise', () => {
    withTz('America/Phoenix', () => {
      expect(buildTimestamp('2026-03-10', '15:30', '14:30')).toBe('2026-03-10T22:30:00.000Z')
    })
  })

  describe('Denver across DST', () => {
    it('before spring-forward uses MST (UTC-7), after uses MDT (UTC-6)', () => {
      withTz('America/Denver', () => {
        expect(buildTimestamp('2026-03-07', '12:00')).toBe('2026-03-07T19:00:00.000Z')
        expect(buildTimestamp('2026-03-09', '12:00')).toBe('2026-03-09T18:00:00.000Z')
      })
    })

    it('rollover on the spring-forward date uses local calendar days, not +24 h: Mar 7 23:30 -> Mar 8 00:30 MST', () => {
      withTz('America/Denver', () => {
        const arrival = buildTimestamp('2026-03-07', '23:30') as string
        const departure = buildTimestamp('2026-03-07', '00:30', '23:30') as string
        expect(arrival).toBe('2026-03-08T06:30:00.000Z')
        expect(departure).toBe('2026-03-08T07:30:00.000Z')
        expect(toDateInput(departure)).toBe('2026-03-08')
        expect(toTimeInput(departure)).toBe('00:30')
      })
    })

    it('rollover from the day before spring-forward lands at local midnight+ of the 23 h day', () => {
      withTz('America/Denver', () => {
        // Mar 8 23:30 MDT -> Mar 9 00:30 MDT (day Mar 8 was 23 h long; +24h would give 01:30)
        expect(buildTimestamp('2026-03-08', '00:30', '23:30')).toBe('2026-03-09T06:30:00.000Z')
        expect(toTimeInput(buildTimestamp('2026-03-08', '00:30', '23:30'))).toBe('00:30')
      })
    })

    it('rollover across fall-back (Nov 1, a 25 h day) still lands on local 00:30 the next day', () => {
      withTz('America/Denver', () => {
        const departure = buildTimestamp('2026-11-01', '00:30', '23:30') as string
        expect(toDateInput(departure)).toBe('2026-11-02')
        expect(toTimeInput(departure)).toBe('00:30')
        expect(departure).toBe('2026-11-02T07:30:00.000Z') // MST again
      })
    })
  })
})

describe('toDateInput / toTimeInput split a stored instant with LOCAL getters', () => {
  it('blank in, blank out', () => {
    expect(toDateInput(undefined)).toBe('')
    expect(toTimeInput(undefined)).toBe('')
  })

  it.each(['America/Phoenix', 'America/Denver', 'Asia/Tokyo', 'UTC'])(
    'round-trips build -> split in %s, including 23:30',
    (tz) => {
      withTz(tz, () => {
        for (const time of ['00:00', '09:05', '23:30', '23:59']) {
          const iso = buildTimestamp('2026-06-15', time) as string
          expect(toDateInput(iso)).toBe('2026-06-15')
          expect(toTimeInput(iso)).toBe(time)
        }
      })
    }
  )
})

describe('zone-aware buildTimestamp / toDateInput / toTimeInput (Denver 2026)', () => {
  it('buildTimestamp reads date and time in the zone, whatever the browser zone', () => {
    withTz('Asia/Tokyo', () => {
      expect(buildTimestamp('2026-01-15', '23:30', undefined, 'America/Denver')).toBe('2026-01-16T06:30:00.000Z')
      expect(buildTimestamp('2026-07-15', '12:00', undefined, 'America/Denver')).toBe('2026-07-15T18:00:00.000Z')
      expect(buildTimestamp('2026-07-15', '12:00', undefined, 'UTC')).toBe('2026-07-15T12:00:00.000Z')
    })
  })
  it('a QT departure past midnight rolls to the next zone day across both DST changes', () => {
    // Nov 1 2026 (25 h day): 23:30 arrival, 00:30 departure is Nov 2 MST
    expect(buildTimestamp('2026-11-01', '00:30', '23:30', 'America/Denver')).toBe('2026-11-02T07:30:00.000Z')
    // Mar 7 -> Mar 8 spring forward: 23:30 arrival, 00:30 departure is Mar 8 MST (07:30Z)
    expect(buildTimestamp('2026-03-07', '00:30', '23:30', 'America/Denver')).toBe('2026-03-08T07:30:00.000Z')
  })
  it('toDateInput / toTimeInput invert it in the zone', () => {
    withTz('Asia/Tokyo', () => {
      expect(toDateInput('2026-01-16T06:30:00Z', 'America/Denver')).toBe('2026-01-15')
      expect(toTimeInput('2026-01-16T06:30:00Z', 'America/Denver')).toBe('23:30')
      expect(toDateInput('2026-01-16T06:30:00Z', 'UTC')).toBe('2026-01-16')
      expect(toTimeInput('2026-01-16T06:30:00Z', 'UTC')).toBe('06:30')
    })
  })
  it('no zone keeps the browser-local behavior', () => {
    withTz('America/Phoenix', () => {
      expect(buildTimestamp('2026-01-15', '23:30')).toBe('2026-01-16T06:30:00.000Z')
      expect(toTimeInput('2026-01-16T06:30:00Z')).toBe('23:30')
    })
  })
})

describe('convertFormZone', () => {
  const form = { date: '2026-11-10', arrival: '07:30', departure: '08:30', actualArrival: '', actualDeparture: '' }

  it('keeps the instants when Denver (MST) flips to Zulu and back', () => {
    const zulu = convertFormZone(form, 'America/Denver', 'UTC')
    expect(zulu).toEqual({ date: '2026-11-10', arrival: '14:30', departure: '15:30', actualArrival: '', actualDeparture: '' })
    expect(convertFormZone(zulu, 'UTC', 'America/Denver')).toEqual(form)
  })

  it('uses MDT in summer (07:30 Denver = 13:30Z)', () => {
    expect(convertFormZone({ ...form, date: '2026-07-10' }, 'America/Denver', 'UTC').arrival).toBe('13:30')
  })

  it('moves the date across midnight and keeps the rollover chain', () => {
    const late = { ...form, arrival: '18:30', departure: '19:30', actualArrival: '18:40', actualDeparture: '19:35' }
    const zulu = convertFormZone(late, 'America/Denver', 'UTC')
    expect(zulu).toMatchObject({ date: '2026-11-11', arrival: '01:30', departure: '02:30', actualArrival: '01:40', actualDeparture: '02:35' })
    expect(convertFormZone(zulu, 'UTC', 'America/Denver')).toEqual(late)
  })

  it('handles a QT that crosses local midnight', () => {
    const qt = { ...form, arrival: '23:30', departure: '00:30' }
    const zulu = convertFormZone(qt, 'America/Denver', 'UTC')
    expect(zulu).toMatchObject({ date: '2026-11-11', arrival: '06:30', departure: '07:30' })
    expect(convertFormZone(zulu, 'UTC', 'America/Denver')).toEqual(qt)
  })

  it('departure-only works; blank form follows "today" only', () => {
    expect(convertFormZone({ ...form, arrival: '' }, 'America/Denver', 'UTC')).toMatchObject({ arrival: '', departure: '15:30' })
    const now = new Date('2026-11-10T03:00:00Z') // Nov 9 evening in Denver, Nov 10 in UTC
    const blank = { date: '2026-11-09', arrival: '', departure: '', actualArrival: '', actualDeparture: '' }
    expect(convertFormZone(blank, 'America/Denver', 'UTC', now).date).toBe('2026-11-10')
    expect(convertFormZone({ ...blank, date: '2026-12-01' }, 'America/Denver', 'UTC', now).date).toBe('2026-12-01')
  })

  it('is a no-op for the same zone', () => {
    expect(convertFormZone(form, 'UTC', 'UTC')).toBe(form)
  })
})

describe('per-time dates (B40)', () => {
  const Z = 'America/Denver'
  const base = { date: '2026-11-10', arrival: '09:00', departure: '15:00', actualArrival: '', actualDeparture: '' }

  it('defaults every time to the first date; a departure before the arrival time still rolls a day', () => {
    expect(formTimestamps(base, Z)).toMatchObject({
      arrival: buildTimestamp('2026-11-10', '09:00', undefined, Z),
      departure: buildTimestamp('2026-11-10', '15:00', undefined, Z)
    })
    const qt = { ...base, arrival: '23:30', departure: '00:30' }
    expect(formTimestamps(qt, Z).departure).toBe(buildTimestamp('2026-11-11', '00:30', undefined, Z))
  })

  it('a 3-day stay: departure date override is used as typed, even when the time is later than the arrival', () => {
    const stay = { ...base, departureDate: '2026-11-12' }
    expect(formTimestamps(stay, Z).departure).toBe(buildTimestamp('2026-11-12', '15:00', undefined, Z))
    expect(displayDates(stay, Z).departure).toBe('2026-11-12')
  })

  it('an actual arrival after midnight takes its own date', () => {
    const late = { ...base, arrival: '23:00', departure: '', actualArrival: '00:20', actualArrivalDate: '2026-11-11' }
    expect(formTimestamps(late, Z).actualArrival).toBe(buildTimestamp('2026-11-11', '00:20', undefined, Z))
  })

  it('an actual departure earlier than the actual arrival time rolls to the next day', () => {
    const f = { ...base, actualArrival: '09:10', actualDeparture: '08:00' }
    expect(formTimestamps(f, Z).actualDeparture).toBe(buildTimestamp('2026-11-11', '08:00', undefined, Z))
  })

  it('loads a stored 3-day stay with its dates, and a same-day flight with no overrides', () => {
    const inst = {
      arrival: buildTimestamp('2026-11-10', '09:00', undefined, Z),
      departure: buildTimestamp('2026-11-12', '15:00', undefined, Z),
      actualArrival: buildTimestamp('2026-11-11', '00:20', undefined, Z)
    }
    expect(formFromInstants(inst, Z)).toEqual({
      date: '2026-11-10', arrival: '09:00', departure: '15:00', actualArrival: '00:20', actualDeparture: '',
      departureDate: '2026-11-12', actualArrivalDate: '2026-11-11'
    })
    const sameDay = { arrival: inst.arrival, departure: buildTimestamp('2026-11-10', '15:00', undefined, Z) }
    expect(formFromInstants(sameDay, Z)).toEqual(base)
  })

  it('load -> rebuild round-trips the instants', () => {
    const inst = {
      arrival: buildTimestamp('2026-11-10', '23:30', undefined, Z),
      departure: buildTimestamp('2026-11-13', '07:00', undefined, Z),
      actualDeparture: buildTimestamp('2026-11-13', '07:40', undefined, Z)
    }
    expect(formTimestamps(formFromInstants(inst, Z), Z)).toEqual(inst)
  })

  it('a departure-only flight uses the departure date as the first date', () => {
    const inst = { departure: buildTimestamp('2026-11-12', '15:00', undefined, Z) }
    expect(formFromInstants(inst, Z).date).toBe('2026-11-12')
  })

  it('the Zulu flip keeps multi-day instants', () => {
    const stay = { ...base, departureDate: '2026-11-12' }
    const zulu = convertFormZone(stay, Z, 'UTC')
    expect(formTimestamps(zulu, 'UTC')).toEqual(formTimestamps(stay, Z))
    expect(convertFormZone(zulu, 'UTC', Z)).toEqual(stay)
  })
})

describe('formatGroundTime', () => {
  it('spans days', () => {
    expect(formatGroundTime('2026-11-10T16:00:00Z', '2026-11-13T20:05:00Z')).toBe('3d 4h 5m')
    expect(formatGroundTime('2026-11-10T16:00:00Z', '2026-11-10T16:45:00Z')).toBe('45m')
    expect(formatGroundTime('2026-11-10T16:00:00Z', '2026-11-10T18:05:00Z')).toBe('2h 5m')
    expect(formatGroundTime('2026-11-10T16:00:00Z', undefined)).toBe('N/A')
  })
})
