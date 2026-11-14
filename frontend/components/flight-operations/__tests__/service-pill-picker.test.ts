import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ServicePillPickerView, ServicePillSkeleton, ServicePillView } from '../service-pill-picker'

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

const tks = { key: 'tks_fluid', label: 'TKS Fluid', icon: 'droplets', color: 'lime', quantity_unit: 'gal' }

describe('ServicePillPickerView quantities', () => {
  const withTks = { catalog: [...catalog, tks], onQuantitiesChange: () => {} }

  it('shows a labelled numeric input only for a selected service that has a quantity_unit', () => {
    const html = render({ ...withTks, value: ['fuel', 'tks_fluid'], quantities: { tks_fluid: 12 } })
    const inputs = html.match(/<input[^>]*>/g) ?? []
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toContain('aria-label="TKS Fluid quantity (gal)"')
    expect(inputs[0]).toContain('type="number"')
    expect(inputs[0]).toContain('min="1"')
    expect(inputs[0]).toContain('value="12"')
    expect(html).toContain('>gal<')
    // all four pills still toggle buttons
    expect(html.match(/<button/g)).toHaveLength(4)
  })

  it('defaults the input to 1 when the selected service has no quantity yet', () => {
    const html = render({ ...withTks, value: ['tks_fluid'] })
    expect(html).toContain('value="1"')
  })

  it('renders no input when unselected, when the service has no unit, or when onQuantitiesChange is absent', () => {
    expect(render({ ...withTks, value: ['fuel'] })).not.toContain('<input')
    expect(render({ ...withTks, value: ['fuel', 'lav'], quantities: { fuel: 3 } })).not.toContain('<input')
    expect(render({ catalog: [...catalog, tks], value: ['tks_fluid'], quantities: { tks_fluid: 12 } })).not.toContain('<input')
  })

  it('selecting a quantity service reports key and a default quantity of 1; removing it drops the quantity', () => {
    const calls: unknown[] = []
    const el = createElement(ServicePillPickerView, {
      catalog: [...catalog, tks],
      value: [],
      onChange: (k: string[]) => calls.push(['keys', k]),
      onQuantitiesChange: (q: Record<string, number>) => calls.push(['q', q]),
    }) as { props: Parameters<typeof ServicePillPickerView>[0] }
    // Call the view function directly to reach the onClick handler of the TKS button.
    const tree = ServicePillPickerView(el.props) as unknown as { props: { children: Array<{ props: { onClick?: () => void; 'data-service-key'?: string } }> } }
    tree.props.children.find((c) => c.props['data-service-key'] === 'tks_fluid')?.props.onClick?.()
    expect(calls).toEqual([['keys', ['tks_fluid']], ['q', { tks_fluid: 1 }]])

    calls.length = 0
    const on = ServicePillPickerView({
      catalog: [...catalog, tks],
      value: ['tks_fluid', 'fuel'],
      quantities: { tks_fluid: 12 },
      onChange: (k) => calls.push(['keys', k]),
      onQuantitiesChange: (q) => calls.push(['q', q]),
    }) as unknown as { props: { children: Array<{ key: string; props: { children: Array<{ props: { onClick?: () => void } }> } }> } }
    const wrapper = on.props.children.find((c) => c.key === 'tks_fluid')
    wrapper?.props.children[0].props.onClick?.()
    expect(calls).toEqual([['keys', ['fuel']], ['q', {}]])
  })
})

describe('ServicePillView', () => {
  it('shows "label · qty unit" only when the service has a unit and a quantity is given', () => {
    const view = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ServicePillView, { serviceKey: 'tks_fluid', ...props }))
    expect(view({ service: tks, quantity: 12 })).toContain('TKS Fluid · 12 gal')
    expect(view({ service: tks })).not.toContain('·')
    expect(view({ service: { ...tks, quantity_unit: null }, quantity: 12 })).not.toContain('·')
    expect(view({ quantity: 12 })).not.toContain('·')
  })

  it('labels from the catalog row and falls back to the humanised key', () => {
    expect(renderToStaticMarkup(createElement(ServicePillView, { serviceKey: 'lav', service: catalog[1] }))).toContain('>Lav<')
    const generic = renderToStaticMarkup(createElement(ServicePillView, { serviceKey: 'brand_new' }))
    expect(generic).toContain('Brand New')
    expect(generic).toContain('data-service-key="brand_new"')
  })
})

describe('ServicePillSkeleton (B138)', () => {
  it('is a keyless placeholder, so no derived label like "Gpu" can show while the catalog loads', () => {
    const html = renderToStaticMarkup(createElement(ServicePillSkeleton))
    expect(html).toContain('data-service-loading="true"')
    expect(html).not.toContain('data-service-key')
    expect(html).not.toMatch(/>[A-Za-z]/)
  })

  it('ServicePillView still labels from the catalog row as stored', () => {
    const html = renderToStaticMarkup(
      createElement(ServicePillView, { serviceKey: 'gpu', service: { key: 'gpu', label: 'GPU', icon: 'zap', color: 'yellow' } })
    )
    expect(html).toContain('>GPU<')
  })
})
