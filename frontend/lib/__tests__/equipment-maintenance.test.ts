import { describe, expect, it } from 'vitest'
import { instantToWallClock, sortMaintenanceItems, wallClockToInstant } from '../equipment-maintenance'

describe('wallClockToInstant', () => {
  it('reads the wall clock in the given zone (MST in winter, MDT in summer)', () => {
    expect(wallClockToInstant('2026-11-05T02:00', 'America/Denver')).toBe('2026-11-05T09:00:00.000Z')
    expect(wallClockToInstant('2026-07-05T02:00', 'America/Denver')).toBe('2026-07-05T08:00:00.000Z')
  })

  it('does not depend on the browser zone: other zones give other instants', () => {
    expect(wallClockToInstant('2026-11-05T02:00', 'UTC')).toBe('2026-11-05T02:00:00.000Z')
    expect(wallClockToInstant('2026-11-05T02:00', 'America/New_York')).toBe('2026-11-05T07:00:00.000Z')
  })

  it('round-trips with instantToWallClock', () => {
    const iso = wallClockToInstant('2026-11-05T02:00', 'America/Denver')
    expect(instantToWallClock(iso, 'America/Denver')).toBe('2026-11-05T02:00')
    expect(instantToWallClock('2026-11-05T09:30:00Z', 'America/Denver')).toBe('2026-11-05T02:30')
  })
})

describe('sortMaintenanceItems', () => {
  const item = (id: number, status: 'open' | 'resolved', noted_at: string) => ({ id, status, noted_at })

  it('lists open items first (newest noted first), then resolved ones (newest noted first)', () => {
    const sorted = sortMaintenanceItems([
      item(1, 'resolved', '2026-11-04T10:00:00Z'),
      item(2, 'open', '2026-11-01T10:00:00Z'),
      item(3, 'resolved', '2026-11-05T10:00:00Z'),
      item(4, 'open', '2026-11-03T10:00:00Z'),
    ])
    expect(sorted.map((i) => i.id)).toEqual([4, 2, 3, 1])
  })

  it('breaks equal times by id, newest first, and does not mutate the input', () => {
    const input = [item(1, 'open', '2026-11-01T10:00:00Z'), item(2, 'open', '2026-11-01T10:00:00Z')]
    expect(sortMaintenanceItems(input).map((i) => i.id)).toEqual([2, 1])
    expect(input.map((i) => i.id)).toEqual([1, 2])
  })
})
