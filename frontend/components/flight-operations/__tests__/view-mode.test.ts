import { describe, expect, it } from 'vitest'
import { effectiveView, type BoardView } from '../view-mode'

describe('effectiveView (D4: no calendar on a phone)', () => {
  it('falls back to split for calendar on mobile', () => {
    expect(effectiveView('calendar', true)).toBe('split')
  })
  it('keeps calendar on desktop', () => {
    expect(effectiveView('calendar', false)).toBe('calendar')
  })
  it.each<BoardView>(['split', 'arrivals', 'departures'])('keeps %s on mobile', (v) => {
    expect(effectiveView(v, true)).toBe(v)
    expect(effectiveView(v, false)).toBe(v)
  })
})
