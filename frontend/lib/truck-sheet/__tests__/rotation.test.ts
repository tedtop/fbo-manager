import { describe, expect, it } from 'vitest'
import { addRotation, fitScale, isNearQuarterTurn, normalizeRotation, rotatedSize, rotationFromAngle } from '../rotation'

describe('rotation maths', () => {
  it('normalizes to the nearest quarter turn', () => {
    expect([0, 89, 91, 180, 359, 360, -90, -270, 450].map(normalizeRotation)).toEqual([0, 90, 90, 180, 0, 0, 270, 90, 90])
  })

  it('maps the text direction to the clockwise turn that straightens it', () => {
    expect(rotationFromAngle(0)).toBe(0)
    expect(rotationFromAngle(90)).toBe(270) // reads downwards: turn it back counter-clockwise
    expect(rotationFromAngle(-90)).toBe(90)
    expect(rotationFromAngle(180)).toBe(180)
    expect(rotationFromAngle(-180)).toBe(180)
    expect(rotationFromAngle(5)).toBe(0)
  })

  it('knows when an angle is too far from a right angle to trust', () => {
    expect([0, 5, -10, 90, 85, 175, -92].every((a) => isNearQuarterTurn(a))).toBe(true)
    expect([45, 40, 135, -50].some((a) => isNearQuarterTurn(a))).toBe(false)
  })

  it('adds manual turns on top of the applied one', () => {
    expect(addRotation(0, -90)).toBe(270)
    expect(addRotation(270, 90)).toBe(0)
    expect(addRotation(180, 90)).toBe(270)
  })

  it('swaps width and height for quarter turns only', () => {
    expect(rotatedSize(400, 300, 90)).toEqual({ width: 300, height: 400 })
    expect(rotatedSize(400, 300, 270)).toEqual({ width: 300, height: 400 })
    expect(rotatedSize(400, 300, 180)).toEqual({ width: 400, height: 300 })
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 })
  })

  it('scales down to the cap but never up', () => {
    expect(fitScale(6000, 3000, 3000)).toBe(0.5)
    expect(fitScale(1000, 2000, 3000)).toBe(1)
  })
})
