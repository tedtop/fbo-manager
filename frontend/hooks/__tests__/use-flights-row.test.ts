import { describe, expect, it } from 'vitest'
import { rowToFlight } from '../use-flights'

// The form's "reload their changes" path (edit-concurrency conflict) maps a fresh row through rowToFlight;
// the junction (flight_service) is the source of services and quantities, never the legacy column (B26e).
describe('rowToFlight (form reload path)', () => {
  const row = {
    id: 'f1',
    tail_number: 'N123AB',
    flight_status: 'scheduled',
    services: ['legacy-only'],
    flight_service: [
      { quantity: 12, service: { key: 'tks', sort_order: 2, quantity_unit: 'gal' } },
      { quantity: null, service: { key: 'gpu', sort_order: 1, quantity_unit: null } }
    ],
    aircraft: { aircraft_type_display: 'Citation CJ3', parked_area: null }
  }

  it('reads services from the junction in catalog order, ignoring the legacy column', () => {
    expect(rowToFlight(row).services).toEqual(['gpu', 'tks'])
  })

  it('keeps per-service quantities', () => {
    expect(rowToFlight(row).serviceQuantities).toEqual({ tks: 12 })
  })

  it('B17: shows the joined creator, and the neutral fallback (not a fake admin) when there is none', () => {
    expect(
      rowToFlight({ ...row, created_by: { id: 5, first_name: 'Tess', last_name: 'Tower', username: 'tt', role: 'line' } })
        .createdBy
    ).toEqual({ initials: 'TT', name: 'Tess Tower', department: 'Line Department' })
    expect(rowToFlight({ ...row, created_by: null }).createdBy).toEqual({
      initials: '--',
      name: 'Unknown creator',
      department: 'No creator recorded'
    })
  })

  it('carries the joined aircraft type', () => {
    expect(rowToFlight(row).aircraftType).toBe('Citation CJ3')
  })
})
