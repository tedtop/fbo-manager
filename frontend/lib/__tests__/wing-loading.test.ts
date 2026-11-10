import { describe, expect, it } from 'vitest'
import { findFuelType, planWingLoad, truckCheck } from '@/lib/wing-loading'

const b737 = findFuelType('737')!

describe('findFuelType', () => {
  it('recognises the common airline type strings', () => {
    expect(findFuelType('737')?.key).toBe('b737ng')
    expect(findFuelType('B738')?.key).toBe('b737ng')
    expect(findFuelType('B739M')?.key).toBe('b737max9')
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
