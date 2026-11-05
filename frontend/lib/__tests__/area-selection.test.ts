import {
  CLICK_SETTLE_MS,
  isMapClickSuppressed,
  resolveAreaClick
} from '@/lib/area-selection'
import { describe, expect, it } from 'vitest'

const big = {
  id: 1,
  polygon: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0]
  ]
}
const small = {
  id: 2,
  polygon: [
    [2, 2],
    [4, 2],
    [4, 4],
    [2, 4],
    [2, 2]
  ]
}
const unbounded = { id: 3, polygon: null }
const areas = [big, small, unbounded]

const click = (
  point: [number, number],
  selectedId: number | null,
  onDrawShape = false
) => resolveAreaClick({ point, areas, selectedId, onDrawShape })

describe('resolveAreaClick', () => {
  it('selects the area under the click when nothing is selected', () => {
    expect(click([8, 8], null)).toEqual({ kind: 'select', areaId: 1 })
  })

  it('switches to another area when its polygon is clicked', () => {
    expect(click([8, 8], 2)).toEqual({ kind: 'select', areaId: 1 })
  })

  it('prefers the smallest area where polygons overlap', () => {
    expect(click([3, 3], 1)).toEqual({ kind: 'select', areaId: 2 })
  })

  it('keeps the selection when the selected area is clicked again', () => {
    expect(click([8, 8], 1)).toEqual({ kind: 'keep' })
  })

  it('deselects when empty map is clicked', () => {
    expect(click([50, 50], 1)).toEqual({ kind: 'deselect' })
    expect(click([50, 50], 3)).toEqual({ kind: 'deselect' })
  })

  it('does nothing on empty map when nothing is selected', () => {
    expect(click([50, 50], null)).toEqual({ kind: 'keep' })
  })

  it('keeps the selection when a handle of the editable shape is clicked', () => {
    expect(click([10.0001, 5], 1, true)).toEqual({ kind: 'keep' })
  })

  it('still switches areas when the click is on a different polygon over the editable shape', () => {
    expect(click([3, 3], 1, true)).toEqual({ kind: 'select', areaId: 2 })
  })
})

describe('isMapClickSuppressed', () => {
  it('ignores clicks while a polygon is being drawn', () => {
    expect(
      isMapClickSuppressed({ drawing: true, finishedAt: null, now: 1000 })
    ).toBe(true)
  })

  it('lets clicks through when nothing was drawn recently', () => {
    expect(
      isMapClickSuppressed({ drawing: false, finishedAt: null, now: 1000 })
    ).toBe(false)
  })

  it('ignores the click that closes a shape, right after drawing finished', () => {
    expect(
      isMapClickSuppressed({ drawing: false, finishedAt: 1000, now: 1000 })
    ).toBe(true)
    expect(
      isMapClickSuppressed({
        drawing: false,
        finishedAt: 1000,
        now: 1000 + CLICK_SETTLE_MS - 1
      })
    ).toBe(true)
  })

  it('accepts clicks again once the settle window has passed', () => {
    expect(
      isMapClickSuppressed({
        drawing: false,
        finishedAt: 1000,
        now: 1000 + CLICK_SETTLE_MS
      })
    ).toBe(false)
  })

  it('honours a custom settle window', () => {
    expect(
      isMapClickSuppressed({
        drawing: false,
        finishedAt: 0,
        now: 50,
        settleMs: 100
      })
    ).toBe(true)
    expect(
      isMapClickSuppressed({
        drawing: false,
        finishedAt: 0,
        now: 150,
        settleMs: 100
      })
    ).toBe(false)
  })
})
