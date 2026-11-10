import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WingLoadingPanel } from '../wing-loading-panel'

const html = (props: { aircraftType?: string; plannedLbs: number }) =>
  renderToStaticMarkup(createElement(WingLoadingPanel, props))

describe('WingLoadingPanel', () => {
  it('summarises the split on a 737 with a center tank', () => {
    const out = html({ aircraftType: '737', plannedLbs: 20000 })
    expect(out).toContain('Wing loading')
    expect(out).toContain('L 8,')
    expect(out).toContain('C ')
  })

  it('leaves the center out on an E175', () => {
    const out = html({ aircraftType: 'E75', plannedLbs: 10000 })
    expect(out).toContain('L 5,000')
    expect(out).not.toContain('C ')
  })

  it('renders nothing for a type it does not know', () => {
    expect(html({ aircraftType: 'C172', plannedLbs: 300 })).toBe('')
  })
})
