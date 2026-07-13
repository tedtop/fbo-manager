import { describe, expect, it } from 'vitest'
import { validateSlipMeter } from '../slip-validation'

describe('validateSlipMeter', () => {
  it('returns null when the meter math checks out', () => {
    expect(
      validateSlipMeter({
        meter_start: 1000,
        meter_stop: 1300,
        gallons_delivered: 300
      })
    ).toBeNull()
  })

  it('tolerates small rounding differences (<= 1 gal)', () => {
    expect(
      validateSlipMeter({
        meter_start: 1000,
        meter_stop: 1300.4,
        gallons_delivered: 300
      })
    ).toBeNull()
  })

  it('flags a mismatch beyond tolerance', () => {
    const issue = validateSlipMeter({
      meter_start: 1000,
      meter_stop: 1300,
      gallons_delivered: 250
    })
    expect(issue).toMatch(/Meter math/)
  })

  it('flags a stop reading lower than the start reading', () => {
    const issue = validateSlipMeter({
      meter_start: 1300,
      meter_stop: 1000,
      gallons_delivered: 300
    })
    expect(issue).toBe('Meter stop is lower than meter start')
  })

  it('returns null when readings are incomplete (nothing to check yet)', () => {
    expect(
      validateSlipMeter({
        meter_start: null,
        meter_stop: null,
        gallons_delivered: null
      })
    ).toBeNull()
    expect(
      validateSlipMeter({
        meter_start: 1000,
        meter_stop: 1300,
        gallons_delivered: null
      })
    ).toBeNull()
  })
})
