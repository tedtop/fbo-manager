import { describe, expect, it } from 'vitest'
import {
  US_TIME_ZONES,
  allTimeZones,
  formatBoardTimestamp,
  parseStoredZulu,
  resolveDisplayZone,
  zoneBannerText,
  zoneSuffix
} from '../display-zone'

const DEN = 'America/Denver'

describe('display zone resolution', () => {
  it('Zulu overrides the FBO zone', () => {
    expect(resolveDisplayZone(DEN, false)).toBe(DEN)
    expect(resolveDisplayZone(DEN, true)).toBe('UTC')
  })
  it('the stored preference is only on for "1"', () => {
    expect(parseStoredZulu('1')).toBe(true)
    expect(parseStoredZulu('0')).toBe(false)
    expect(parseStoredZulu(null)).toBe(false)
    expect(parseStoredZulu('true')).toBe(false)
  })
})

describe('labels', () => {
  it('suffix is Z in Zulu, else the zone short name at that instant', () => {
    expect(zoneSuffix(new Date('2026-01-15T12:00:00Z'), DEN, true)).toBe('Z')
    expect(zoneSuffix(new Date('2026-01-15T12:00:00Z'), DEN, false)).toBe('MST')
    expect(zoneSuffix(new Date('2026-07-15T12:00:00Z'), DEN, false)).toBe('MDT')
  })
  it('banner text', () => {
    expect(zoneBannerText(DEN, true)).toBe('Times in Zulu (UTC)')
    expect(zoneBannerText(DEN, false, new Date('2026-01-15T12:00:00Z'))).toBe('Times in MST')
    expect(zoneBannerText(DEN, false, new Date('2026-07-15T12:00:00Z'))).toBe('Times in MDT')
  })
  it('card timestamp label MM/DD HH:mm in the zone', () => {
    expect(formatBoardTimestamp('2026-03-08T09:30:00Z', DEN)).toBe('03/08 03:30') // first MDT hour+
    expect(formatBoardTimestamp('2026-03-08T08:30:00Z', DEN)).toBe('03/08 01:30') // MST
    expect(formatBoardTimestamp('2026-11-01T08:30:00Z', DEN)).toBe('11/01 01:30') // MST after fall back
    expect(formatBoardTimestamp('2026-11-01T06:30:00Z', DEN)).toBe('11/01 00:30') // MDT
    expect(formatBoardTimestamp('2026-11-01T06:30:00Z', 'UTC')).toBe('11/01 06:30')
    expect(formatBoardTimestamp('2026-01-01T06:59:00Z', DEN)).toBe('12/31 23:59')
    expect(formatBoardTimestamp(undefined, DEN)).toBe('')
  })
})

describe('zone lists', () => {
  it('US zones lead and are valid; the full list has no duplicates', () => {
    expect(US_TIME_ZONES.map((z) => z.zone)).toContain('America/Denver')
    const all = allTimeZones()
    expect(all).toContain('UTC')
    expect(all).toContain('Europe/London')
    expect(all).not.toContain('America/Denver')
    expect(new Set(all).size).toBe(all.length)
  })
})
