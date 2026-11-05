import { describe, expect, it } from 'vitest'
import type { TruckSheetWithReadings } from '@/repositories/truck-sheets.repo'
import { summarizeSheet } from '../truck-sheet-summary'

const reading = (over: Record<string, unknown>) => ({ reading_type: 'fueling', meter: null, meter_end: null, gallons_pumped: null, gallons_remaining: null, ...over })
const sheet = (readings: unknown[]) =>
  ({ front_meter_start: 100, rear_meter_start: 500, starting_gallons: 3000, readings } as unknown as TruckSheetWithReadings)

describe('summarizeSheet', () => {
  it('takes the last meter end per meter, sums fueling gallons only, and the last remaining gallons', () => {
    const s = summarizeSheet(
      sheet([
        reading({ meter: 'front', meter_end: 150, gallons_pumped: 50, gallons_remaining: 2950 }),
        reading({ meter: 'rear', meter_end: 560, gallons_pumped: 60, gallons_remaining: 2890 }),
        reading({ reading_type: 'tank_fill', gallons_pumped: 1000 }),
        reading({ meter: 'front', meter_end: 200, gallons_pumped: 50, gallons_remaining: 2840 }),
      ])
    )
    expect(s).toEqual({ frontStart: 100, frontEnd: 200, rearStart: 500, rearEnd: 560, gallonsPumped: 160, startingGallons: 3000, remainingGallons: 2840 })
  })

  it('gives nulls and zero for a sheet without readings', () => {
    expect(summarizeSheet(sheet([]))).toMatchObject({ frontEnd: null, rearEnd: null, gallonsPumped: 0, remainingGallons: null })
  })
})
