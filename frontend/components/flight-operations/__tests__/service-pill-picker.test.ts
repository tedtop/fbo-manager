import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServicePillPickerView, ServicePillView } from '../service-pill-picker'

const catalog = [
  { key: 'fuel', label: 'Fuel', icon: 'fuel', color: 'blue' },
  { key: 'lav', label: 'Lav', icon: 'droplet', color: 'cyan' },
  { key: 'oxygen', label: 'Oxygen', icon: 'wind', color: 'purple' },
]

const render = (props: Partial<Parameters<typeof ServicePillPickerView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ServicePillPickerView, { catalog, value: [], onChange: () => {}, ...props })
  )

describe('ServicePillPickerView', () => {
  it('renders one toggle button per catalog service with the label as its text and aria-pressed', () => {
    const html = render({ value: ['lav'] })
    const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? []
    expect(buttons).toHaveLength(3)
    expect(buttons.every((b) => b.includes('type="button"'))).toBe(true)
    const byKey = (key: string) => buttons.find((b) => b.includes(`data-service-key="${key}"`)) ?? ''
    expect(byKey('lav')).toContain('aria-pressed="true"')
    expect(byKey('fuel')).toContain('aria-pressed="false"')
    expect(byKey('lav')).toContain('>Lav</button>')
    expect(byKey('oxygen')).toContain('>Oxygen</button>')
  })

  it('shows a retired/unknown key on the flight as a selected generic pill so it can be removed', () => {
    const html = render({ value: ['fuel', 'old_service'] })
    expect(html).toContain('data-service-key="old_service"')
    expect(html).toContain('Old Service')
    const old = (html.match(/<button[^>]*>.*?<\/button>/g) ?? []).find((b) => b.includes('old_service')) ?? ''
    expect(old).toContain('aria-pressed="true"')
  })

  it('disables every button when disabled', () => {
    const buttons = render({ disabled: true }).match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(3)
    expect(buttons.every((b) => b.includes('disabled'))).toBe(true)
  })

  it('renders skeleton placeholders while the catalog loads', () => {
    const html = render({ catalog: [], loading: true })
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('<button')
  })

  it('renders nothing selectable for an empty, loaded catalog', () => {
    expect(render({ catalog: [] })).not.toContain('<button')
  })
})

describe('ServicePillView', () => {
  it('labels from the catalog row and falls back to the humanised key', () => {
    expect(renderToStaticMarkup(createElement(ServicePillView, { serviceKey: 'lav', service: catalog[1] }))).toContain('>Lav<')
    const generic = renderToStaticMarkup(createElement(ServicePillView, { serviceKey: 'brand_new' }))
    expect(generic).toContain('Brand New')
    expect(generic).toContain('data-service-key="brand_new"')
  })
})
