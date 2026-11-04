import { describe, expect, it } from 'vitest'
import { prefillAirports } from '../airport-prefill'

const home = 'KMSO'

describe('prefillAirports', () => {
  it('an arrival (no departure) lands at home: destination = home', () => {
    expect(prefillAirports({ arrival: '14:30', departure: '', home })).toEqual({
      origin: '',
      destination: 'KMSO'
    })
  })

  it('a hangar pull (departure, no arrival) leaves from home: origin = home', () => {
    expect(prefillAirports({ arrival: '', departure: '09:00', home })).toEqual({
      origin: 'KMSO',
      destination: ''
    })
  })

  it('a turn comes from and goes elsewhere: nothing prefilled', () => {
    expect(
      prefillAirports({ arrival: '14:30', departure: '15:30', home })
    ).toEqual({ origin: '', destination: '' })
  })

  it('no times yet: nothing prefilled', () => {
    expect(prefillAirports({ arrival: '', departure: '', home })).toEqual({
      origin: '',
      destination: ''
    })
  })

  it('no home airport: nothing prefilled', () => {
    expect(
      prefillAirports({ arrival: '14:30', departure: '', home: '  ' })
    ).toEqual({ origin: '', destination: '' })
  })

  it('uses whatever code the home setting holds', () => {
    expect(
      prefillAirports({ arrival: '14:30', departure: '', home: 'KGPI' })
    ).toEqual({ origin: '', destination: 'KGPI' })
  })
})
