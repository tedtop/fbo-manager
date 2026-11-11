import { describe, expect, it } from 'vitest'
import { inchesToGallons } from '@/lib/gallons-tables'
import { lowestReading, resolveLowestLevel } from '@/lib/fuel-farm'

describe('lowestReading', () => {
  it('returns null for no readings', () => {
    expect(lowestReading([])).toBeNull()
  })

  it('picks the lowest level and its date, whatever the order', () => {
    const low = lowestReading([
      { level: '54.5', recordedAt: '2026-03-01T10:00:00Z' },
      { level: 12.25, recordedAt: '2026-05-02T08:00:00Z' },
      { level: '80', recordedAt: '2026-06-01T10:00:00Z' }
    ])
    expect(low).toEqual({ level: 12.25, recordedAt: '2026-05-02T08:00:00Z' })
  })

  it('keeps the earliest date on a tie', () => {
    const low = lowestReading([
      { level: 10, recordedAt: '2026-05-02T08:00:00Z' },
      { level: 10, recordedAt: '2026-01-02T08:00:00Z' }
    ])
    expect(low?.recordedAt).toBe('2026-01-02T08:00:00Z')
  })

  it('ignores non-numeric levels', () => {
    expect(lowestReading([{ level: 'abc', recordedAt: '2026-01-01T00:00:00Z' }])).toBeNull()
  })
})

describe('resolveLowestLevel', () => {
  const measured = { level: 14, recordedAt: '2026-05-02T08:00:00Z' }

  it('uses the measured value when there is no override', () => {
    const r = resolveLowestLevel('T2', measured, null)
    expect(r).toEqual({ inches: 14, gallons: Math.round(inchesToGallons('T2', 14)), source: 'measured' })
  })

  it('the override wins over the measured value, even when it is higher or zero', () => {
    expect(resolveLowestLevel('T2', measured, 9).source).toBe('override')
    expect(resolveLowestLevel('T2', measured, 9).inches).toBe(9)
    expect(resolveLowestLevel('T2', measured, 0).inches).toBe(0)
  })

  it('has nothing to show without a reading or override, and an override works without readings', () => {
    expect(resolveLowestLevel('T2', null, null)).toEqual({ inches: null, gallons: null, source: 'none' })
    expect(resolveLowestLevel('T2', null, 7).source).toBe('override')
  })
})
