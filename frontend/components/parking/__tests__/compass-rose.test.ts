import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompassRose } from '../compass-rose'

const render = (heading: number, mapBearing: number, typeIcao = 'C172') =>
  renderToStaticMarkup(
    createElement(CompassRose, {
      heading,
      mapBearing,
      typeIcao,
      onChange: () => {}
    })
  )

describe('CompassRose markup', () => {
  it('is a keyboard-focusable slider with the heading as its value', () => {
    const html = render(130, 40)
    expect(html).toContain('role="slider"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Aircraft heading"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="359"')
    expect(html).toContain('aria-valuenow="130"')
  })

  it('draws the four cardinal marks, 36 ticks and the map-up notch', () => {
    const html = render(0, 0)
    for (const mark of ['N', 'E', 'S', 'W'])
      expect(html).toContain(`>${mark}</text>`)
    expect(html.match(/<line /g)).toHaveLength(36)
    expect(html).toContain('data-testid="map-up-notch"')
  })

  it('turns the plane to heading minus map bearing', () => {
    expect(render(130, 40)).toContain('transform="rotate(90)"')
    expect(render(0, 40)).toContain('transform="rotate(320)"')
  })

  it('turns north with the map: N sits at -bearing', () => {
    // North on a map turned 90 degrees is at screen angle 270: the left of the rose.
    const html = render(0, 90)
    const north = html.match(
      /<text x="([-\d.e]+)" y="([-\d.e]+)"[^>]*>N<\/text>/
    )
    expect(north).not.toBeNull()
    expect(Number(north?.[1])).toBeLessThan(-60)
    expect(Math.abs(Number(north?.[2]))).toBeLessThan(1e-9)
  })

  it('draws a type missing from the table at nominal size', () => {
    expect(render(10, 0, 'ZZZZ')).toContain('data-testid="compass-plane"')
  })
})
