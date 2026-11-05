import { withTz } from '@/tests/support/with-tz'
import { describe, expect, it } from 'vitest'
import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  isValidTimeZone,
  localDayStartIso,
  localNextDayStartIso,
  parseLocalDate,
  toInstantIso,
  weekdayOfDate,
  zonedTimeToInstant,
  zoneShortName
} from '../local-date'

const DEN = 'America/Denver'

describe('zone-aware formatting is independent of the browser zone', () => {
  for (const browser of ['America/Phoenix', 'Asia/Tokyo', 'UTC']) {
    it(`Denver wall clock, browser in ${browser}`, () => {
      withTz(browser, () => {
        const winter = new Date('2026-01-15T06:30:00Z') // MST = UTC-7
        expect(formatLocalDate(winter, DEN)).toBe('2026-01-14')
        expect(formatLocalTime(winter, DEN)).toBe('23:30')
        const summer = new Date('2026-07-15T06:30:00Z') // MDT = UTC-6
        expect(formatLocalDate(summer, DEN)).toBe('2026-07-15')
        expect(formatLocalTime(summer, DEN)).toBe('00:30')
      })
    })
  }
  it('midnight reads 00:00, never 24:00', () => {
    const d = new Date('2026-01-15T07:00:00Z')
    expect(formatLocalTime(d, DEN)).toBe('00:00')
    expect(formatLocalDate(d, DEN)).toBe('2026-01-15')
    expect(formatLocalTime(new Date('2026-01-15T00:00:00Z'), 'UTC')).toBe('00:00')
  })
  it('Zulu (UTC) is the UTC date and time', () => {
    const d = new Date('2026-03-11T05:30:00Z')
    expect(formatLocalDate(d, 'UTC')).toBe('2026-03-11')
    expect(formatLocalTime(d, 'UTC')).toBe('05:30')
  })
  it('without a zone the browser zone is used (unchanged behavior)', () => {
    withTz('America/Phoenix', () => {
      expect(formatLocalTime(new Date('2026-03-11T05:30:00Z'))).toBe('22:30')
    })
  })
})

describe('day boundaries across the 2026 Denver DST changes', () => {
  it('spring forward Sun Mar 8: the day is 23 h', () => {
    expect(localDayStartIso('2026-03-07', DEN)).toBe('2026-03-07T07:00:00.000Z')
    expect(localDayStartIso('2026-03-08', DEN)).toBe('2026-03-08T07:00:00.000Z') // MST
    expect(localNextDayStartIso('2026-03-08', DEN)).toBe('2026-03-09T06:00:00.000Z') // MDT
    expect(localDayStartIso('2026-03-09', DEN)).toBe('2026-03-09T06:00:00.000Z')
  })
  it('fall back Sun Nov 1: the day is 25 h', () => {
    expect(localDayStartIso('2026-11-01', DEN)).toBe('2026-11-01T06:00:00.000Z') // MDT
    expect(localNextDayStartIso('2026-11-01', DEN)).toBe('2026-11-02T07:00:00.000Z') // MST
  })
  it('the same day is the same instants whatever the browser zone is', () => {
    for (const browser of ['Asia/Tokyo', 'America/Phoenix']) {
      withTz(browser, () => {
        expect(localDayStartIso('2026-03-08', DEN)).toBe('2026-03-08T07:00:00.000Z')
        expect(localNextDayStartIso('2026-11-01', DEN)).toBe('2026-11-02T07:00:00.000Z')
      })
    }
  })
  it('Zulu day starts at 00:00Z', () => {
    expect(localDayStartIso('2026-03-08', 'UTC')).toBe('2026-03-08T00:00:00.000Z')
    expect(localNextDayStartIso('2026-03-08', 'UTC')).toBe('2026-03-09T00:00:00.000Z')
  })
  it('Phoenix has no DST: always UTC-7', () => {
    expect(localDayStartIso('2026-07-01', 'America/Phoenix')).toBe('2026-07-01T07:00:00.000Z')
    expect(localDayStartIso('2026-01-01', 'America/Phoenix')).toBe('2026-01-01T07:00:00.000Z')
  })
})

describe('zonedTimeToInstant', () => {
  it('a skipped wall time (02:30 on Mar 8) lands after the gap', () => {
    expect(zonedTimeToInstant(2026, 3, 8, 2, 30, DEN).toISOString()).toBe('2026-03-08T09:30:00.000Z')
  })
  it('a repeated wall time (01:30 on Nov 1) resolves to its first occurrence (MDT)', () => {
    expect(zonedTimeToInstant(2026, 11, 1, 1, 30, DEN).toISOString()).toBe('2026-11-01T07:30:00.000Z')
  })
  it('23:30 and 00:30 around midnight in Denver and Zulu', () => {
    expect(zonedTimeToInstant(2026, 1, 15, 23, 30, DEN).toISOString()).toBe('2026-01-16T06:30:00.000Z')
    expect(zonedTimeToInstant(2026, 1, 16, 0, 30, 'UTC').toISOString()).toBe('2026-01-16T00:30:00.000Z')
  })
  it('round-trips through formatLocalDate/Time', () => {
    const i = zonedTimeToInstant(2026, 7, 4, 18, 45, DEN)
    expect(formatLocalDate(i, DEN)).toBe('2026-07-04')
    expect(formatLocalTime(i, DEN)).toBe('18:45')
  })
  it('parseLocalDate with a zone is midnight there; without, browser midnight', () => {
    expect(parseLocalDate('2026-01-15', DEN).toISOString()).toBe('2026-01-15T07:00:00.000Z')
    withTz('America/Phoenix', () => {
      expect(parseLocalDate('2026-01-15').toISOString()).toBe('2026-01-15T07:00:00.000Z')
    })
  })
})

describe('calendar arithmetic', () => {
  it('addLocalDays crosses month, year and DST days exactly', () => {
    expect(addLocalDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(addLocalDays('2026-10-31', 2)).toBe('2026-11-02')
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('weekdayOfDate: Mar 8 and Nov 1 2026 are Sundays', () => {
    expect(weekdayOfDate('2026-03-08')).toBe(0)
    expect(weekdayOfDate('2026-11-01')).toBe(0)
    expect(weekdayOfDate('2026-11-05')).toBe(4)
  })
})

describe('toInstantIso', () => {
  it('keeps an explicit offset', () => {
    expect(toInstantIso('2026-03-10T09:00:00-06:00', DEN)).toBe('2026-03-10T09:00:00-06:00')
  })
  it('an offset-less value is read in the given zone', () => {
    expect(toInstantIso('2026-03-10T09:00', DEN)).toBe('2026-03-10T15:00:00.000Z')
  })
})

describe('zone names and validation', () => {
  it('short names follow DST', () => {
    expect(zoneShortName(new Date('2026-01-15T12:00:00Z'), DEN)).toBe('MST')
    expect(zoneShortName(new Date('2026-07-15T12:00:00Z'), DEN)).toBe('MDT')
    expect(zoneShortName(new Date('2026-07-15T12:00:00Z'), 'America/Phoenix')).toBe('MST')
    expect(zoneShortName(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe('UTC')
  })
  it('the switch days name the zone by the instant, not the day', () => {
    expect(zoneShortName(new Date('2026-03-08T08:59:00Z'), DEN)).toBe('MST')
    expect(zoneShortName(new Date('2026-03-08T09:00:00Z'), DEN)).toBe('MDT')
    expect(zoneShortName(new Date('2026-11-01T07:59:00Z'), DEN)).toBe('MDT')
    expect(zoneShortName(new Date('2026-11-01T08:00:00Z'), DEN)).toBe('MST')
  })
  it('isValidTimeZone', () => {
    expect(isValidTimeZone('America/Denver')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
  })
})
