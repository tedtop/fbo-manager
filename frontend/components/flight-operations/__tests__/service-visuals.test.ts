import { Bus, Sparkles, Tag, Wrench } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { fallbackServiceLabel, GENERIC_SERVICE_COLOR, getServiceVisual } from '../service-visuals'

const SEEDED = [
  'fuel', 'hangar', 'catering', 'gpu', 'lav', 'oxygen', 'courtesy_car', 'rental_car',
  'passengers', 'coffee', 'ice', 'dishes', 'cleaning', 'maintenance', 'ground_transport',
]

describe('getServiceVisual', () => {
  it('knows every seeded key without a catalog row (no generic fallback)', () => {
    for (const key of SEEDED) {
      const v = getServiceVisual(key)
      expect(v.Icon).not.toBe(Tag)
      expect(v.color).not.toBe(GENERIC_SERVICE_COLOR)
    }
  })

  it('ports the card colours and maps the three new keys', () => {
    expect(getServiceVisual('fuel').color).toBe('bg-blue-500/10 text-blue-500 border-blue-500/20')
    expect(getServiceVisual('lav').color).toBe('bg-cyan-500/10 text-cyan-500 border-cyan-500/20')
    expect(getServiceVisual('cleaning')).toMatchObject({ Icon: Sparkles, color: expect.stringContaining('emerald') })
    expect(getServiceVisual('maintenance')).toMatchObject({ Icon: Wrench, color: expect.stringContaining('slate') })
    expect(getServiceVisual('ground_transport')).toMatchObject({ Icon: Bus, color: expect.stringContaining('pink') })
  })

  it('lets the catalog row (icon name + colour token) win over the key defaults', () => {
    const v = getServiceVisual('fuel', { icon: 'wrench', color: 'pink' })
    expect(v.Icon).toBe(Wrench)
    expect(v.color).toContain('pink')
  })

  it('falls back to a generic pill for unknown keys, icons and colours, never throwing', () => {
    expect(getServiceVisual('brand_new')).toEqual({ Icon: Tag, color: GENERIC_SERVICE_COLOR })
    expect(getServiceVisual('brand_new', { icon: 'nope', color: 'nope' })).toEqual({ Icon: Tag, color: GENERIC_SERVICE_COLOR })
    expect(getServiceVisual('', null)).toEqual({ Icon: Tag, color: GENERIC_SERVICE_COLOR })
    // known key + unknown tokens on the row: key defaults still apply
    expect(getServiceVisual('fuel', { icon: 'nope', color: 'nope' }).color).toContain('blue')
  })
})

describe('fallbackServiceLabel', () => {
  it('title-cases a snake_case key', () => {
    expect(fallbackServiceLabel('ground_transport')).toBe('Ground Transport')
    expect(fallbackServiceLabel('gpu')).toBe('Gpu')
    expect(fallbackServiceLabel('')).toBe('')
  })
})
