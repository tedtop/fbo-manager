import { describe, expect, it } from 'vitest'
import {
  cardinalScreenAngles,
  fitSilhouette,
  headingToScreenAngle,
  keyboardHeading,
  pointerToHeading,
  roseTicks
} from '../compass-rose'

// Offsets from the rose centre in screen pixels: x right, y down.
const UP: [number, number] = [0, -50]
const RIGHT: [number, number] = [50, 0]
const DOWN: [number, number] = [0, 50]
const LEFT: [number, number] = [-50, 0]

describe('pointerToHeading', () => {
  it.each([
    // [map bearing, up, right, down, left]
    [0, 0, 90, 180, 270],
    [40, 40, 130, 220, 310],
    [90, 90, 180, 270, 0],
    [270, 270, 0, 90, 180]
  ])(
    'bearing %i: up/right/down/left give %i/%i/%i/%i',
    (bearing, u, r, d, l) => {
      expect(pointerToHeading(...UP, bearing)).toBe(u)
      expect(pointerToHeading(...RIGHT, bearing)).toBe(r)
      expect(pointerToHeading(...DOWN, bearing)).toBe(d)
      expect(pointerToHeading(...LEFT, bearing)).toBe(l)
    }
  )

  it('reads a diagonal: up-right is 45 degrees clockwise of screen up', () => {
    expect(pointerToHeading(30, -30, 0)).toBe(45)
    expect(pointerToHeading(30, -30, 40)).toBe(85)
    expect(pointerToHeading(-30, 30, 0)).toBe(225)
  })

  it('does not depend on the distance from the centre', () => {
    expect(pointerToHeading(3, -3, 0)).toBe(pointerToHeading(90, -90, 0))
  })

  it('gives no heading at the exact centre', () => {
    expect(pointerToHeading(0, 0, 40)).toBeNull()
  })

  it('stays within 0..359 and wraps at north', () => {
    expect(pointerToHeading(0, -10, 0)).toBe(0)
    // A hair left of straight up is 359.4 degrees, which rounds to 359.
    expect(pointerToHeading(-0.1, -10, 0)).toBe(359)
    // 359.9 degrees rounds to 360, stored as 0.
    expect(pointerToHeading(-0.001, -10, 0)).toBe(0)
    for (let a = 0; a < 720; a += 7) {
      const rad = (a * Math.PI) / 180
      const h = pointerToHeading(Math.sin(rad), -Math.cos(rad), a % 360)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(359)
    }
  })
})

describe('headingToScreenAngle', () => {
  it('turns north by minus the map bearing', () => {
    expect(headingToScreenAngle(0, 0)).toBe(0)
    expect(headingToScreenAngle(0, 40)).toBe(320)
    expect(headingToScreenAngle(40, 40)).toBe(0)
    expect(headingToScreenAngle(90, 270)).toBe(180)
  })

  it('normalises 0, 359 and 360', () => {
    expect(headingToScreenAngle(360, 0)).toBe(0)
    expect(headingToScreenAngle(359, 0)).toBe(359)
    expect(headingToScreenAngle(359, 359)).toBe(0)
    expect(headingToScreenAngle(0, 360)).toBe(0)
  })

  it('round-trips with pointerToHeading for every heading and bearing', () => {
    for (const bearing of [0, 1, 40, 90, 180, 270, 359]) {
      for (let heading = 0; heading < 360; heading++) {
        const screen = headingToScreenAngle(heading, bearing)
        const rad = (screen * Math.PI) / 180
        expect(
          pointerToHeading(Math.sin(rad) * 80, -Math.cos(rad) * 80, bearing)
        ).toBe(heading)
      }
    }
  })
})

describe('cardinalScreenAngles', () => {
  it('puts N at the top and E on the right with the map north up', () => {
    expect(cardinalScreenAngles(0)).toEqual({ N: 0, E: 90, S: 180, W: 270 })
  })

  it('turns every mark against the map rotation', () => {
    expect(cardinalScreenAngles(40)).toEqual({ N: 320, E: 50, S: 140, W: 230 })
    expect(cardinalScreenAngles(270)).toEqual({ N: 90, E: 180, S: 270, W: 0 })
  })
})

describe('roseTicks', () => {
  const ticks = roseTicks(40)

  it('has a tick every 10 degrees: 4 major, 8 medium, 24 minor', () => {
    expect(ticks).toHaveLength(36)
    expect(
      ticks.filter((t) => t.kind === 'major').map((t) => t.heading)
    ).toEqual([0, 90, 180, 270])
    expect(ticks.filter((t) => t.kind === 'medium')).toHaveLength(8)
    expect(ticks.filter((t) => t.kind === 'minor')).toHaveLength(24)
    expect(
      ticks
        .filter((t) => t.kind === 'medium')
        .every((t) => t.heading % 30 === 0)
    ).toBe(true)
  })

  it('draws each tick at its heading minus the map bearing', () => {
    expect(ticks.find((t) => t.heading === 0)?.screenAngle).toBe(320)
    expect(ticks.find((t) => t.heading === 40)?.screenAngle).toBe(0)
  })
})

describe('keyboardHeading', () => {
  it('turns by 1 degree, clockwise on Right/Up', () => {
    expect(keyboardHeading(100, 'ArrowRight')).toBe(101)
    expect(keyboardHeading(100, 'ArrowUp')).toBe(101)
    expect(keyboardHeading(100, 'ArrowLeft')).toBe(99)
    expect(keyboardHeading(100, 'ArrowDown')).toBe(99)
  })

  it('turns by 10 degrees with Shift', () => {
    expect(keyboardHeading(100, 'ArrowRight', true)).toBe(110)
    expect(keyboardHeading(100, 'ArrowLeft', true)).toBe(90)
  })

  it('wraps around north in both directions', () => {
    expect(keyboardHeading(359, 'ArrowRight')).toBe(0)
    expect(keyboardHeading(0, 'ArrowLeft')).toBe(359)
    expect(keyboardHeading(355, 'ArrowUp', true)).toBe(5)
    expect(keyboardHeading(5, 'ArrowDown', true)).toBe(355)
  })

  it('sets north on Home and ignores other keys', () => {
    expect(keyboardHeading(200, 'Home')).toBe(0)
    expect(keyboardHeading(200, 'a')).toBeNull()
    expect(keyboardHeading(200, 'Tab')).toBeNull()
  })
})

describe('fitSilhouette', () => {
  it('keeps the aspect and fits the circle at every rotation', () => {
    for (const [w, l] of [
      [11, 8.3],
      [35.8, 37.6],
      [10, 40],
      [40, 10]
    ]) {
      const fit = fitSilhouette(w, l, 52)
      expect(fit.width / fit.height).toBeCloseTo(w / l, 9)
      // The corners are the farthest points whatever the rotation.
      expect(Math.hypot(fit.width, fit.height) / 2).toBeCloseTo(52, 9)
    }
  })

  it('handles a zero-size box', () => {
    expect(fitSilhouette(0, 0, 52)).toEqual({ width: 0, height: 0 })
  })
})
