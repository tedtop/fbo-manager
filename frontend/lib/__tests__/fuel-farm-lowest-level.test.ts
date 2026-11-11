import { describe, expect, it } from 'vitest'
import { lowestReading } from '@/lib/fuel-farm'

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
