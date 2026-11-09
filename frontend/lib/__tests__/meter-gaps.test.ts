import { describe, expect, it } from 'vitest'
import { detectGaps, pumpedGallons, startMismatch, type SheetLike } from '../meter-gaps'

let id = 0
const r = (meter: 'front' | 'rear', start: number, end: number, line: number, extra: Record<string, unknown> = {}) => ({
  id: ++id, line_number: line, reading_type: 'fueling', meter, meter_start: start, meter_end: end, ...extra
})
const sheet = (sid: number, date: string, readings: ReturnType<typeof r>[], header: Partial<SheetLike> = {}): SheetLike => ({
  id: sid, sheet_date: date, front_meter_start: null, rear_meter_start: null, readings: readings as SheetLike['readings'], ...header
})

describe('detectGaps', () => {
  it('finds nothing in a clean chain across days', () => {
    const s = [
      sheet(1, '2026-11-01', [r('front', 100, 150, 1), r('front', 150, 210, 2)]),
      sheet(2, '2026-11-02', [r('front', 210, 260, 1)])
    ]
    const rep = detectGaps(s)
    expect(rep.gaps).toEqual([])
    expect(rep.lastEnd).toEqual({ front: 260, rear: null })
  })

  it('flags a forward gap with the missing gallons', () => {
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 100, 150, 1), r('front', 180.5, 200, 2)])])
    expect(rep.gaps).toHaveLength(1)
    expect(rep.gaps[0]).toMatchObject({ kind: 'gap', meter: 'front', expectedStart: 150, actualStart: 180.5, missingGallons: 30.5 })
  })

  it('tracks front and rear separately', () => {
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 0, 10, 1), r('rear', 500, 520, 2), r('front', 10, 30, 3), r('rear', 520, 540, 4)])])
    expect(rep.gaps).toEqual([])
    expect(rep.lastEnd).toEqual({ front: 30, rear: 540 })
  })

  it('flags an overlap (start below the previous end) with a negative amount', () => {
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 100, 150, 1), r('front', 140, 170, 2)])])
    expect(rep.gaps[0]).toMatchObject({ kind: 'overlap', missingGallons: -10 })
  })

  it('recognises a roll-over inside one fueling and chains on from the small end', () => {
    expect(pumpedGallons(999_950, 30)).toEqual({ gallons: 80, rolledOver: true })
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 999_900, 999_950, 1), r('front', 999_950, 30, 2), r('front', 30, 90, 3)])])
    expect(rep.gaps).toEqual([])
    expect(rep.lastEnd.front).toBe(90)
  })

  it('flags a roll-over between two readings as a rollover gap with the real missing gallons', () => {
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 999_900, 999_990, 1), r('front', 5, 40, 2)])])
    expect(rep.gaps[0]).toMatchObject({ kind: 'rollover', missingGallons: 15 })
  })

  it('does not chain a reading whose stop is below its start without a roll', () => {
    expect(pumpedGallons(500, 100)).toBeNull()
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 100, 150, 1), r('front', 500, 100, 2), r('front', 150, 200, 3)])])
    expect(rep.gaps).toEqual([])
  })

  it('orders by sheet date, so a scan of an earlier day uploaded later does not create a gap', () => {
    const later = sheet(9, '2026-11-02', [r('front', 210, 260, 1)])
    const earlier = sheet(10, '2026-11-01', [r('front', 100, 210, 1)]) // created after, listed after
    expect(detectGaps([later, earlier]).gaps).toEqual([])
  })

  it('tolerates readings whose line order is wrong within a sheet when the numbers still chain', () => {
    const s = sheet(1, '2026-11-01', [r('front', 100, 150, 1), r('front', 200, 250, 2), r('front', 150, 200, 3)])
    expect(detectGaps([s]).gaps).toEqual([])
  })

  it('uses the sheet header as an anchor: a wrong opening number is a gap even with no fuelings between', () => {
    const rep = detectGaps([
      sheet(1, '2026-11-01', [r('front', 100, 150, 1)], { front_meter_start: 100 }),
      sheet(2, '2026-11-02', [r('front', 190, 200, 1)], { front_meter_start: 190 })
    ])
    expect(rep.gaps).toHaveLength(1)
    expect(rep.gaps[0]).toMatchObject({ kind: 'gap', toSheetId: 2, toReadingId: null, missingGallons: 40 })
  })

  it('ignores tank fills and readings without numbers', () => {
    const fill = r('front', 5000, 5500, 2, { reading_type: 'tank_fill' })
    const blank = { ...r('front', 0, 0, 3), meter_end: null }
    const rep = detectGaps([sheet(1, '2026-11-01', [r('front', 100, 150, 1), fill, blank as never, r('front', 150, 160, 4)])])
    expect(rep.gaps).toEqual([])
  })
})

describe('startMismatch', () => {
  it('is null when the start continues the last end or nothing is known', () => {
    expect(startMismatch(150, 150)).toBeNull()
    expect(startMismatch(null, 150)).toBeNull()
    expect(startMismatch(150, undefined)).toBeNull()
  })
  it('reports the missing gallons', () => {
    expect(startMismatch(150, 182)).toMatchObject({ kind: 'gap', missingGallons: 32, lastEnd: 150 })
    expect(startMismatch(150, 140)).toMatchObject({ kind: 'overlap', missingGallons: -10 })
    expect(startMismatch(999_990, 5)).toMatchObject({ kind: 'rollover', missingGallons: 15 })
  })
})
