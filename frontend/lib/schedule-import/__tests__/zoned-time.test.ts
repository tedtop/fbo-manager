import { describe, expect, it } from 'vitest'
import { withTz } from '@/tests/support/with-tz'
import { addDaysToDateString, tzOffsetMinutes, zonedWallTimeToInstant } from '../zoned-time'

describe('tzOffsetMinutes', () => {
  it('Phoenix is UTC-7 year round', () => {
    expect(tzOffsetMinutes(Date.parse('2026-01-15T12:00:00Z'), 'America/Phoenix')).toBe(-420)
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'), 'America/Phoenix')).toBe(-420)
  })
  it('New York is -5 in winter and -4 in summer', () => {
    expect(tzOffsetMinutes(Date.parse('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300)
    expect(tzOffsetMinutes(Date.parse('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240)
  })
})

describe('zonedWallTimeToInstant', () => {
  it('formats the wall time with the zone offset', () => {
    const z = zonedWallTimeToInstant('2026-11-05', '06:30', 'America/Phoenix')
    expect(z.iso).toBe('2026-11-05T06:30:00-07:00')
    expect(z.instantMs).toBe(Date.parse('2026-11-05T13:30:00Z'))
    expect(z.status).toBe('ok')
  })

  it('Phoenix has no spring-forward gap: 02:30 on the US DST date exists', () => {
    const z = zonedWallTimeToInstant('2026-03-08', '02:30', 'America/Phoenix')
    expect(z).toMatchObject({ iso: '2026-03-08T02:30:00-07:00', status: 'ok' })
  })

  it('New York offsets switch at the spring-forward instant', () => {
    expect(zonedWallTimeToInstant('2026-03-08', '01:30', 'America/New_York').iso).toBe('2026-03-08T01:30:00-05:00')
    expect(zonedWallTimeToInstant('2026-03-08', '03:15', 'America/New_York').iso).toBe('2026-03-08T03:15:00-04:00')
  })

  it('New York spring-forward gap: 02:30 does not exist and moves to 03:30 EDT', () => {
    const z = zonedWallTimeToInstant('2026-03-08', '02:30', 'America/New_York')
    expect(z.status).toBe('nonexistent')
    expect(z.iso).toBe('2026-03-08T03:30:00-04:00')
    expect(z.instantMs).toBe(Date.parse('2026-03-08T07:30:00Z'))
  })

  it('New York fall-back overlap: 01:30 occurs twice, the first (EDT) is used', () => {
    const z = zonedWallTimeToInstant('2026-11-01', '01:30', 'America/New_York')
    expect(z.status).toBe('ambiguous')
    expect(z.iso).toBe('2026-11-01T01:30:00-04:00')
    expect(z.instantMs).toBe(Date.parse('2026-11-01T05:30:00Z'))
  })

  it('does not depend on the process TZ', () => {
    const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((tz) =>
      withTz(tz, () => zonedWallTimeToInstant('2026-03-08', '02:30', 'America/New_York').iso)
    )
    expect(new Set(results)).toEqual(new Set(['2026-03-08T03:30:00-04:00']))
  })
})

describe('addDaysToDateString', () => {
  it('rolls month and year and ignores DST', () => {
    expect(addDaysToDateString('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28')
  })
})
