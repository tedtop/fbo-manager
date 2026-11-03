import { describe, expect, it } from 'vitest'
import { withTz } from '@/tests/support/with-tz'
import {
  addLocalDays,
  formatLocalDate,
  formatLocalTime,
  localDayStartIso,
  localNextDayStartIso,
  parseLocalDate,
  toInstantIso,
} from '../local-date'

describe('formatLocalDate / formatLocalTime use local getters, not the UTC date', () => {
  it('Phoenix (UTC-7): 2026-03-11T05:30Z is still Mar 10 22:30 locally', () => {
    withTz('America/Phoenix', () => {
      const d = new Date('2026-03-11T05:30:00Z')
      expect(formatLocalDate(d)).toBe('2026-03-10')
      expect(formatLocalTime(d)).toBe('22:30')
    })
  })
  it('Tokyo (UTC+9): 2026-03-10T20:00Z is already Mar 11 05:00 locally', () => {
    withTz('Asia/Tokyo', () => {
      const d = new Date('2026-03-10T20:00:00Z')
      expect(formatLocalDate(d)).toBe('2026-03-11')
      expect(formatLocalTime(d)).toBe('05:00')
    })
  })
})

describe('parseLocalDate', () => {
  it('is local midnight, not UTC midnight', () => {
    withTz('America/Phoenix', () => {
      expect(parseLocalDate('2026-03-10').toISOString()).toBe('2026-03-10T07:00:00.000Z')
    })
  })
})

describe('addLocalDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('is calendar arithmetic across DST (Denver spring-forward and fall-back)', () => {
    withTz('America/Denver', () => {
      expect(addLocalDays('2026-03-07', 1)).toBe('2026-03-08')
      expect(addLocalDays('2026-03-08', 1)).toBe('2026-03-09')
      expect(addLocalDays('2026-11-01', 1)).toBe('2026-11-02')
    })
  })
})

describe('local day bounds as UTC instants', () => {
  it('Phoenix: day is 07:00Z..07:00Z next day', () => {
    withTz('America/Phoenix', () => {
      expect(localDayStartIso('2026-03-10')).toBe('2026-03-10T07:00:00.000Z')
      expect(localNextDayStartIso('2026-03-10')).toBe('2026-03-11T07:00:00.000Z')
    })
  })
  it('Denver spring-forward day (2026-03-08) is 23 h long', () => {
    withTz('America/Denver', () => {
      const start = new Date(localDayStartIso('2026-03-08')).getTime()
      const end = new Date(localNextDayStartIso('2026-03-08')).getTime()
      expect(localDayStartIso('2026-03-08')).toBe('2026-03-08T07:00:00.000Z') // MST
      expect(localNextDayStartIso('2026-03-08')).toBe('2026-03-09T06:00:00.000Z') // MDT
      expect((end - start) / 3_600_000).toBe(23)
    })
  })
  it('Denver fall-back day (2026-11-01) is 25 h long', () => {
    withTz('America/Denver', () => {
      const start = new Date(localDayStartIso('2026-11-01')).getTime()
      const end = new Date(localNextDayStartIso('2026-11-01')).getTime()
      expect((end - start) / 3_600_000).toBe(25)
    })
  })
})

describe('toInstantIso', () => {
  it('keeps values that carry Z or an offset', () => {
    expect(toInstantIso('2026-03-10T09:00:00Z')).toBe('2026-03-10T09:00:00Z')
    expect(toInstantIso('2026-03-10T09:00:00-07:00')).toBe('2026-03-10T09:00:00-07:00')
  })
  it('converts an offset-less value as local wall-clock', () => {
    withTz('America/Phoenix', () => {
      expect(toInstantIso('2026-03-10T09:00')).toBe('2026-03-10T16:00:00.000Z')
      expect(toInstantIso('2026-03-10T09:00:00')).toBe('2026-03-10T16:00:00.000Z')
    })
  })
})
