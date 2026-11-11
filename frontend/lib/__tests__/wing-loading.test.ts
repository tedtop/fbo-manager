import { describe, expect, it } from 'vitest'
import { AIRCRAFT_FUEL_TYPES, findFuelType, planWingLoad, truckCheck } from '@/lib/wing-loading'

const b737 = findFuelType('737')!

describe('findFuelType', () => {
  it('recognises the common airline type strings', () => {
    expect(findFuelType('737')?.key).toBe('b737ng')
    expect(findFuelType('B738')?.key).toBe('b737ng')
    expect(findFuelType('B739M')?.key).toBe('b737max')
    expect(findFuelType('B38M')?.key).toBe('b737max')
    expect(findFuelType('737 MAX 8')?.key).toBe('b737max')
    expect(findFuelType('B739')?.key).toBe('b737ng')
    expect(findFuelType('E75')?.key).toBe('e175')
    expect(findFuelType('E175')?.key).toBe('e175')
    expect(findFuelType('A320')?.key).toBe('a320')
    expect(findFuelType('C172')).toBeUndefined()
  })
})

describe('planWingLoad', () => {
  // United UA1026 sheet, 10/29: 3740 / 0 / 3900 before, planned gate fuel 20,400 -> add 12,760.
  it('fills both wings to the max and puts the rest in the center, like the United sheet', () => {
    const r = planWingLoad({
      capacity: b737,
      wingMaxLbs: 8650,
      before: { left: 3740, center: 0, right: 3900 },
      plannedLbs: 20400
    })
    expect(r.after.left).toBe(8650)
    expect(r.after.right).toBe(8650)
    expect(r.after.center).toBe(3100)
    expect(r.add.center).toBe(3100)
    expect(r.totalAddLbs).toBe(12760)
    expect(r.totalAddGallons).toBeCloseTo(1879.2, 1)
    expect(r.beforeTotalLbs).toBe(7640)
    expect(r.warnings).toEqual([])
  })

  it('splits a small uplift evenly across the wings and leaves the center empty', () => {
    const r = planWingLoad({ capacity: b737, plannedLbs: 10000 })
    expect(r.after).toEqual({ left: 5000, center: 0, right: 5000 })
  })

  it('has no center tank on an E175 and warns when the request will not fit', () => {
    const e175 = findFuelType('E175')!
    expect(planWingLoad({ capacity: e175, plannedLbs: 15000 }).hasCenter).toBe(false)
    const over = planWingLoad({ capacity: e175, plannedLbs: 25000 })
    expect(over.after.center).toBe(0)
    expect(over.warnings[0]).toMatch(/more than the wings can hold/)
  })

  it('uses the winter wing max when asked', () => {
    const r = planWingLoad({ capacity: b737, plannedLbs: 30000, winter: true })
    expect(r.after.left).toBe(8800)
  })

  it('flags a tank that already holds more than the target', () => {
    const r = planWingLoad({ capacity: b737, before: { left: 9000, right: 0 }, plannedLbs: 9500 })
    expect(r.warnings.join()).toMatch(/balance or defuel/)
  })
})

describe('truckCheck', () => {
  it('compares calculated gallons with the truck meter against the 75 gallon tolerance', () => {
    expect(truckCheck(1879.2, 1886)).toEqual({ difference: -7, withinTolerance: true, tolerance: 75 })
    expect(truckCheck(1879, 1700).withinTolerance).toBe(false)
  })
})

// Documented capacities (see the source comment in lib/wing-loading.ts): Boeing 1,288 / 4,299 / 1,288 US gal at
// 6.7 lb/gal; Airbus wing 2,046 gal each (neo, smallest variant), center 2,179 gal at 0.785 kg/l.
describe('documented tank capacities', () => {
  const split = (type: string, plannedLbs: number) => {
    const t = findFuelType(type)!
    return { t, r: planWingLoad({ capacity: t, plannedLbs }) }
  }

  it.each(['B738', 'B739'])('%s: full tanks sum to the published 6,875 gal and 46,062 lb', (type) => {
    const t = findFuelType(type)!
    expect(t.key).toBe('b737ng')
    expect(t.wingLbs).toBe(8630)
    expect(t.centerLbs).toBe(28803)
    expect(2 * t.wingLbs + t.centerLbs!).toBeCloseTo(46062, -1)
    const { r } = split(type, 40000)
    expect(r.after).toEqual({ left: 8630, center: 22740, right: 8630 })
    expect(r.warnings).toEqual([])
  })

  it.each(['B38M', 'B39M'])('%s: MAX wings 8,650 lb (airline slips), center derived from 6,820 gal', (type) => {
    const { t, r } = split(type, 20000)
    expect(t.key).toBe('b737max')
    expect(t.wingLbs).toBe(8650)
    expect(t.centerLbs).toBe(28394)
    expect(2 * t.wingLbs + t.centerLbs!).toBe(45694)
    expect(t.source).toMatch(/airline fuel slips/)
    expect(t.source).toMatch(/derived/)
    expect(r.after).toEqual({ left: 8650, center: 2700, right: 8650 })
  })

  it.each(['A319', 'A320'])('%s: wings fill to 13,404 lbs each before the center takes fuel', (type) => {
    const { t, r } = split(type, 30000)
    expect(t.key).toBe('a320')
    expect(t.verified).toBe(true)
    expect(t.wingLbs).toBe(13404)
    expect(t.centerLbs).toBe(14275)
    expect(r.after).toEqual({ left: 13404, center: 3192, right: 13404 })
  })

  it('warns when the center tank would overflow', () => {
    const { r } = split('A320', 45000)
    expect(r.after.center).toBe(14275)
    expect(r.warnings.join()).toMatch(/Center tank over/)
  })

  it('has no unverified types left', () => {
    expect(AIRCRAFT_FUEL_TYPES.filter((t) => !t.verified).map((t) => t.key)).toEqual([])
  })
})
