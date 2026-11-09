import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { QTDispatch } from '@/types/qt-dispatch'
import { DispatchCard } from '../dispatch-card'

const base: QTDispatch = {
  FlightID: 'F1',
  FlightNumber: 'UA1026',
  TailNumber: 'N17448',
  AirlineName: 'United',
  AircraftType: '737',
  Destination: 'DEN',
  FlightStatus: 'Planned',
  Quantity: 1000,
  QuantityInWeight: 6700,
  Gate: '4',
  TerminalNumber: 'A',
  ArrivalDate: '2026-11-08 13:00',
  DepartureDate: '2026-11-08 14:00'
}
const now = new Date('2026-11-08T12:30:00').getTime()
const html = (props: Parameters<typeof DispatchCard>[0]) => renderToStaticMarkup(createElement(DispatchCard, props))

describe('DispatchCard (Minuteman card)', () => {
  it('shows the flight, status badge class, gate, FR24 link and fuel total', () => {
    const out = html({ dispatch: base, now })
    expect(out).toContain('UA1026 to DEN')
    expect(out).toContain('fd-flight-status planned')
    expect(out).toContain('737 · Gate A4')
    expect(out).toContain('flightradar24.com/data/aircraft/n17448')
    expect(out).toContain('6700 lbs (1000 gal)')
    expect(out).toContain('in 30m')
    expect(out).toContain('fd-urgency-warn')
  })

  it('prefers the live ADS-B ETA and the transponder type for inbound flights', () => {
    const out = html({
      dispatch: base,
      now,
      track: { distanceNm: 100, groundSpeedKt: 400, altitudeFt: 20000, onGround: false, etaMinutes: 15, equipmentCode: 'B39M' }
    })
    expect(out).toContain('in ~15m')
    expect(out).toContain('fd-live-badge')
    expect(out).toContain('fd-urgency-critical')
    expect(out).toContain('B39M (737)')
  })

  it('flags changes with banners and the orange border', () => {
    const out = html({
      dispatch: { ...base, MEL: true, MELMessage: 'APU inop' },
      now,
      changes: {
        fuel: [{ oldValue: 6700, newValue: 8000, increased: true, detectedAt: 0 }],
        gate: [{ oldValue: 'A4', newValue: 'B2', detectedAt: 0 }],
        time: [{ label: 'Departure', oldValue: '2026-11-08 14:00', newValue: '2026-11-08 15:00', detectedAt: 0 }]
      }
    })
    expect(out).toContain('has-change')
    expect(out).toContain('APU inop')
    expect(out).toContain('Fuel increased: 6,700 → 8,000 lbs')
    expect(out).toContain('Gate changed: A4 → B2')
    expect(out).toContain('Departure changed:')
  })

  it('shows elapsed time on ground for a flight that is in', () => {
    const out = html({ dispatch: { ...base, FlightStatus: 'In', TimeOnGround: '01:00' }, now })
    expect(out).toContain('Time on Ground')
    expect(out).toContain('of 01:00 scheduled')
  })
})
