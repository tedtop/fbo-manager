import { describe, expect, it } from 'vitest'
import {
  EMPTY_FUEL_FORM,
  assertEditable,
  formFromOrder,
  fuelChip,
  initialsOf,
  parseFuelForm,
  pickCardOrder,
  type FlightFuelOrder
} from '../flight-fuel-order'
import { FuelOrderTransitionError } from '../fuel-orders'

const order = (over: Partial<FlightFuelOrder> = {}): FlightFuelOrder => ({
  id: 1,
  status: 'requested',
  gallons_requested: null,
  gallons_delivered: null,
  fuel_type: 'jet_a',
  prist: false,
  requested_for: null,
  fuel_request: null,
  created_at: '2026-11-14T10:00:00Z',
  updated_at: '2026-11-14T10:00:00Z',
  fuelerNames: [],
  ...over
})

describe('fuelChip (order status only)', () => {
  it('has no chip without an order', () => {
    expect(fuelChip(null)).toBeNull()
  })

  it('requested', () => {
    expect(fuelChip(order())).toEqual({ text: 'Fuel requested', tone: 'info' })
  })

  it('assigned shows initials of every assigned fueler, or plain "assigned" without data', () => {
    expect(fuelChip(order({ status: 'assigned', fuelerNames: ['Tom Tanner'] }))?.text).toBe('Fuel assigned TT')
    expect(fuelChip(order({ status: 'assigned', fuelerNames: ['Tom Tanner', 'kim g'] }))?.text).toBe('Fuel assigned TT KG')
    expect(fuelChip(order({ status: 'assigned' }))?.text).toBe('Fuel assigned')
  })

  it('fueling', () => {
    expect(fuelChip(order({ status: 'fueling' }))).toEqual({ text: 'Fueling', tone: 'progress' })
  })

  it('filled shows the delivered gallons; numeric strings from the database are accepted', () => {
    expect(fuelChip(order({ status: 'filled', gallons_delivered: '312' }))).toEqual({ text: 'Filled 312 gal', tone: 'done' })
    expect(fuelChip(order({ status: 'filled', gallons_delivered: 312.5 }))?.text).toBe('Filled 312.5 gal')
  })

  it('filled with at least the requested gallons is not short; top off is never short', () => {
    expect(fuelChip(order({ status: 'filled', gallons_requested: '300', gallons_delivered: '312' }))?.tone).toBe('done')
    expect(fuelChip(order({ status: 'filled', gallons_requested: null, gallons_delivered: '20' }))?.tone).toBe('done')
  })

  it('filled with fewer gallons than requested is short', () => {
    expect(fuelChip(order({ status: 'filled', gallons_requested: '300', gallons_delivered: '250' }))).toEqual({
      text: 'Short: filled 250 gal of 300 gal',
      tone: 'warn'
    })
  })

  it('cancelled is a muted chip', () => {
    expect(fuelChip(order({ status: 'cancelled' }))).toEqual({ text: 'Fuel cancelled', tone: 'muted' })
  })
})

describe('pickCardOrder', () => {
  it('prefers an open order, then the latest filled, then the latest cancelled', () => {
    const cancelled = order({ id: 1, status: 'cancelled', created_at: '2026-11-14T08:00:00Z' })
    const filled = order({ id: 2, status: 'filled', created_at: '2026-11-14T09:00:00Z' })
    const filled2 = order({ id: 3, status: 'filled', created_at: '2026-11-14T09:30:00Z' })
    const open = order({ id: 4, status: 'assigned', created_at: '2026-11-14T07:00:00Z' })
    expect(pickCardOrder([cancelled, filled, filled2, open])?.id).toBe(4)
    expect(pickCardOrder([cancelled, filled, filled2])?.id).toBe(3)
    expect(pickCardOrder([cancelled])?.id).toBe(1)
    expect(pickCardOrder([])).toBeNull()
  })
})

describe('initialsOf', () => {
  it('takes the first letter of each word, upper-cased', () => {
    expect(initialsOf('Tom Tanner')).toBe('TT')
    expect(initialsOf('  kim   g ')).toBe('KG')
    expect(initialsOf('')).toBe('')
  })
})

describe('parseFuelForm', () => {
  const ref = new Date('2026-11-14T18:00:00Z') // 11:00 on the 14th in Denver
  const zone = 'America/Denver'

  it('top off with defaults: no gallons, Jet A, no Prist, no time, no note', () => {
    expect(parseFuelForm(EMPTY_FUEL_FORM, ref, zone)).toEqual({
      ok: true,
      fields: { gallons_requested: null, fuel_type: 'jet_a', prist: false, requested_for: null, fuel_request: null }
    })
  })

  it('gallons are required, positive and numeric unless Top off', () => {
    for (const gallons of ['', '0', '-5', 'abc']) {
      const res = parseFuelForm({ ...EMPTY_FUEL_FORM, topOff: false, gallons }, ref, zone)
      expect(res.ok).toBe(false)
    }
    const ok = parseFuelForm({ ...EMPTY_FUEL_FORM, topOff: false, gallons: '312.5' }, ref, zone)
    expect(ok).toMatchObject({ ok: true, fields: { gallons_requested: 312.5 } })
  })

  it('Jet A with Prist is stored as jet_a_plus with prist on; Avgas never carries Prist', () => {
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, prist: true }, ref, zone)).toMatchObject({
      fields: { fuel_type: 'jet_a_plus', prist: true }
    })
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, fuelType: 'avgas_100', prist: true }, ref, zone)).toMatchObject({
      fields: { fuel_type: 'avgas', prist: false }
    })
  })

  it('time wanted is read on the reference day in the zone', () => {
    const res = parseFuelForm({ ...EMPTY_FUEL_FORM, time: '14:30' }, ref, zone)
    expect(res).toMatchObject({ ok: true, fields: { requested_for: '2026-11-14T21:30:00.000Z' } })
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, time: '25:00' }, ref, zone).ok).toBe(false)
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, time: 'noon' }, ref, zone).ok).toBe(false)
  })

  it('trims the note and stores blank as null', () => {
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, note: '  tabs ' }, ref, zone)).toMatchObject({ fields: { fuel_request: 'tabs' } })
    expect(parseFuelForm({ ...EMPTY_FUEL_FORM, note: '   ' }, ref, zone)).toMatchObject({ fields: { fuel_request: null } })
  })
})

describe('formFromOrder', () => {
  it('defaults for a new order', () => {
    expect(formFromOrder(null, 'America/Denver')).toEqual(EMPTY_FUEL_FORM)
  })

  it('round-trips an existing order through parseFuelForm', () => {
    const o = order({
      gallons_requested: '300',
      fuel_type: 'jet_a_plus',
      prist: true,
      requested_for: '2026-11-14T21:30:00.000Z',
      fuel_request: 'tabs'
    })
    const form = formFromOrder(o, 'America/Denver')
    expect(form).toEqual({ topOff: false, gallons: '300', fuelType: 'jet_a', prist: true, time: '14:30', note: 'tabs' })
    expect(parseFuelForm(form, new Date('2026-11-14T18:00:00Z'), 'America/Denver')).toMatchObject({
      fields: { gallons_requested: 300, fuel_type: 'jet_a_plus', prist: true, requested_for: o.requested_for, fuel_request: 'tabs' }
    })
  })

  it('an empty gallons figure reads as Top off; avgas stays avgas', () => {
    expect(formFromOrder(order({ fuel_type: 'avgas' }), 'America/Denver')).toMatchObject({ topOff: true, fuelType: 'avgas_100' })
  })
})

describe('assertEditable', () => {
  it('allows open orders and refuses filled and cancelled ones', () => {
    for (const s of ['requested', 'assigned', 'fueling'] as const) expect(() => assertEditable(s)).not.toThrow()
    for (const s of ['filled', 'cancelled'] as const) expect(() => assertEditable(s)).toThrow(FuelOrderTransitionError)
  })
})
