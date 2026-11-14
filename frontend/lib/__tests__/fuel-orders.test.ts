import { describe, expect, it } from 'vitest'
import {
  FUEL_ORDER_STATUSES,
  FuelOrderTransitionError,
  assignPatch,
  cancelPatch,
  canTransition,
  createPatch,
  fillPatch,
  isOpenFuelOrder,
  nextStatus,
  reopenPatch,
  startPatch,
  updateFilledPatch,
  type FuelOrderAction,
  type FuelOrderStatus
} from '../fuel-orders'

const NOW = new Date('2026-11-13T15:30:00.000Z')

// Every (action, from) pair: the legal ones listed, all others must throw.
const LEGAL: Record<FuelOrderAction, Partial<Record<FuelOrderStatus, FuelOrderStatus>>> = {
  assign: { requested: 'assigned' },
  start: { assigned: 'fueling' },
  fill: { requested: 'filled', assigned: 'filled', fueling: 'filled' },
  cancel: { requested: 'cancelled', assigned: 'cancelled', fueling: 'cancelled' },
  reopen: { cancelled: 'requested' }
}

describe('fuel order transition table', () => {
  for (const action of Object.keys(LEGAL) as FuelOrderAction[]) {
    for (const from of FUEL_ORDER_STATUSES) {
      const to = LEGAL[action][from]
      if (to) {
        it(`${action} is legal from ${from} and goes to ${to}`, () => {
          expect(canTransition(from, action)).toBe(true)
          expect(nextStatus(from, action)).toBe(to)
        })
      } else {
        it(`${action} is illegal from ${from}`, () => {
          expect(canTransition(from, action)).toBe(false)
          expect(() => nextStatus(from, action)).toThrow(FuelOrderTransitionError)
        })
      }
    }
  }

  it('treats requested, assigned and fueling as open', () => {
    expect(FUEL_ORDER_STATUSES.filter(isOpenFuelOrder)).toEqual(['requested', 'assigned', 'fueling'])
  })
})

describe('createPatch', () => {
  it('creates as requested with no fill fields', () => {
    expect(createPatch('requested', {}, NOW)).toEqual({ status: 'requested' })
  })

  it('creates as filled with gallons, the filled time and who filled it', () => {
    expect(createPatch('filled', { gallonsDelivered: 1480.5, filledBy: 7 }, NOW)).toEqual({
      status: 'filled',
      gallons_delivered: 1480.5,
      completed_at: NOW.toISOString(),
      filled_by: 7
    })
  })

  it('refuses to create as filled without positive gallons', () => {
    expect(() => createPatch('filled', {}, NOW)).toThrow(FuelOrderTransitionError)
    expect(() => createPatch('filled', { gallonsDelivered: 0 }, NOW)).toThrow(FuelOrderTransitionError)
    expect(() => createPatch('filled', { gallonsDelivered: -5 }, NOW)).toThrow(FuelOrderTransitionError)
  })
})

describe('transition patches', () => {
  it('assign sets status and assigned_at', () => {
    expect(assignPatch('requested', NOW)).toEqual({ status: 'assigned', assigned_at: NOW.toISOString() })
    expect(() => assignPatch('assigned', NOW)).toThrow(FuelOrderTransitionError)
  })

  it('start moves assigned to fueling only', () => {
    expect(startPatch('assigned')).toEqual({ status: 'fueling' })
    expect(() => startPatch('requested')).toThrow(FuelOrderTransitionError)
  })

  it('fill from any open state stores gallons, filled time, filler, truck and prist', () => {
    for (const from of ['requested', 'assigned', 'fueling'] as const) {
      expect(fillPatch(from, { gallonsDelivered: 300, filledBy: 4, fuelTruckId: 9, prist: true }, NOW)).toEqual({
        status: 'filled',
        gallons_delivered: 300,
        completed_at: NOW.toISOString(),
        filled_by: 4,
        fuel_truck_id: 9,
        prist: true
      })
    }
  })

  it('fill leaves truck and prist out when not given, and needs positive gallons', () => {
    expect(fillPatch('fueling', { gallonsDelivered: 50 }, NOW)).toEqual({
      status: 'filled',
      gallons_delivered: 50,
      completed_at: NOW.toISOString(),
      filled_by: null
    })
    expect(() => fillPatch('fueling', { gallonsDelivered: 0 }, NOW)).toThrow(FuelOrderTransitionError)
    expect(() => fillPatch('fueling', { gallonsDelivered: Number.NaN }, NOW)).toThrow(FuelOrderTransitionError)
  })

  it('fill is refused from filled and cancelled', () => {
    expect(() => fillPatch('filled', { gallonsDelivered: 10 }, NOW)).toThrow(FuelOrderTransitionError)
    expect(() => fillPatch('cancelled', { gallonsDelivered: 10 }, NOW)).toThrow(FuelOrderTransitionError)
  })

  it('cancel needs a reason and an open order', () => {
    expect(cancelPatch('assigned', '  left without fuel ')).toEqual({
      status: 'cancelled',
      cancel_reason: 'left without fuel'
    })
    expect(() => cancelPatch('requested', '   ')).toThrow('A cancel reason is required')
    expect(() => cancelPatch('filled', 'oops')).toThrow(FuelOrderTransitionError)
    expect(() => cancelPatch('cancelled', 'again')).toThrow(FuelOrderTransitionError)
  })

  it('reopen goes cancelled -> requested and clears the reason and assignment', () => {
    expect(reopenPatch('cancelled')).toEqual({ status: 'requested', cancel_reason: null, assigned_at: null })
    expect(() => reopenPatch('requested')).toThrow(FuelOrderTransitionError)
    expect(() => reopenPatch('filled')).toThrow(FuelOrderTransitionError)
  })
})

describe('updateFilledPatch', () => {
  it('changes only the gallons of a filled order, never its status', () => {
    expect(updateFilledPatch('filled', 1510)).toEqual({ gallons_delivered: 1510 })
  })

  it('allows zero, the real cancel of a filled order', () => {
    expect(updateFilledPatch('filled', 0)).toEqual({ gallons_delivered: 0 })
  })

  it('refuses negative or non-finite gallons', () => {
    expect(() => updateFilledPatch('filled', -1)).toThrow(FuelOrderTransitionError)
    expect(() => updateFilledPatch('filled', Number.NaN)).toThrow(FuelOrderTransitionError)
  })

  it('refuses every status except filled', () => {
    for (const from of FUEL_ORDER_STATUSES.filter((s) => s !== 'filled')) {
      expect(() => updateFilledPatch(from, 100)).toThrow(FuelOrderTransitionError)
    }
  })
})
