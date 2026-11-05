import { describe, expect, it } from 'vitest'
import { mapExtractedRowToFlightDraft } from '../map-row'
import { mergeLegRows, pairSingleLegRows } from '../pair-legs'
import { row } from './fixtures'
import { SAMPLE_SHEET } from './sample-sheet'

const arr = (tail: string, date: string, time: string, over = {}) =>
  row({ tail_number: tail, arrival_date: date, arrival_time: time, ...over })
const dep = (tail: string, date: string, time: string, over = {}) =>
  row({ tail_number: tail, departure_date: date, departure_time: time, ...over })

describe('pairSingleLegRows', () => {
  it('sample sheet: 6 printed rows become 4 flights', () => {
    const paired = pairSingleLegRows(SAMPLE_SHEET.rows)
    expect(paired.map((p) => [p.row.tail_number, p.sourceRows.length])).toEqual([
      ['N509CQ', 1],
      ['N868CB', 2],
      ['N33PX', 1],
      ['N555HM', 2]
    ])
    const turn = paired[1].row
    expect(turn).toMatchObject({ arrival_date: '2026-11-04', arrival_time: '11:00', departure_date: '2026-11-04', departure_time: '12:00' })
    expect(turn.notes).toBe('Service Duration - Short Stay') // identical notes are not repeated
    expect(turn.customer).toBe('Buybacks-Contract Fuel')
    expect(turn.raw_row_text).toContain('Arrive')
    expect(turn.raw_row_text).toContain('Depart')
    expect(paired[1].sourceRows.map((r) => r.raw_row_text)).toEqual([turn.raw_row_text.split(' // ')[0], turn.raw_row_text.split(' // ')[1]])
  })

  it('pairs an arrival with the next later departure of the same tail, each row used once', () => {
    const rows = [
      arr('N1A', '2026-11-01', '09:00'),
      dep('N1A', '2026-11-02', '10:00'),
      arr('N1A', '2026-11-05', '09:00'),
      dep('N1A', '2026-11-06', '10:00')
    ]
    const out = pairSingleLegRows(rows)
    expect(out).toHaveLength(2)
    expect(out.map((p) => [p.row.arrival_date, p.row.departure_date])).toEqual([
      ['2026-11-01', '2026-11-02'],
      ['2026-11-05', '2026-11-06']
    ])
  })

  it('two arrivals then one departure: the departure goes with the nearest earlier arrival', () => {
    const out = pairSingleLegRows([arr('N1A', '2026-11-01', '09:00'), arr('N1A', '2026-11-05', '09:00'), dep('N1A', '2026-11-06', '10:00')])
    expect(out).toHaveLength(2)
    expect(out[0].sourceRows).toHaveLength(1)
    expect(out[0].row.arrival_date).toBe('2026-11-01')
    expect(out[1].row).toMatchObject({ arrival_date: '2026-11-05', departure_date: '2026-11-06' })
  })

  it('never pairs different tails, a departure before the arrival, or a departure at the same minute', () => {
    expect(pairSingleLegRows([arr('N1A', '2026-11-05', '09:00'), dep('N2B', '2026-11-05', '10:00')])).toHaveLength(2)
    expect(pairSingleLegRows([arr('N1A', '2026-11-05', '09:00'), dep('N1A', '2026-11-04', '10:00')])).toHaveLength(2)
    expect(pairSingleLegRows([arr('N1A', '2026-11-05', '09:00'), dep('N1A', '2026-11-05', '09:00')])).toHaveLength(2)
  })

  it('leaves rows that already have both times, rows without a tail and rows without a usable date alone', () => {
    const both = row({ tail_number: 'N1A', arrival_date: '2026-11-05', arrival_time: '09:00', departure_date: '2026-11-05', departure_time: '10:00' })
    const out = pairSingleLegRows([both, arr('N1A', '2026-11-05', '08:00'), dep('N1A', '2026-11-05', '12:00')])
    expect(out).toHaveLength(2)
    expect(out[0].row).toBe(both)
    expect(out[1].sourceRows).toHaveLength(2)

    expect(pairSingleLegRows([arr('', '2026-11-05', '09:00'), dep('', '2026-11-05', '10:00')])).toHaveLength(2)
    expect(pairSingleLegRows([arr('N1A', '', '09:00'), dep('N1A', '', '10:00')])).toHaveLength(2)
  })

  it('uses the day heading when a leg has no date of its own', () => {
    const out = pairSingleLegRows([
      row({ tail_number: 'N1A', group_date: '2026-11-05', arrival_time: '09:00' }),
      row({ tail_number: 'N1A', group_date: '2026-11-06', departure_time: '10:00' })
    ])
    expect(out).toHaveLength(1)
  })

  it('merges services, notes and the lowest confidence', () => {
    const m = mergeLegRows(
      arr('N1A', '2026-11-05', '09:00', { services: 'fuel, GPU', notes: 'a', customer: 'Acme', confidence: 'high', needs_review: false }),
      dep('N1A', '2026-11-06', '10:00', { services: 'GPU, lav', notes: 'b', customer: 'Other', confidence: 'low', needs_review: true })
    )
    expect(m).toMatchObject({ services: 'fuel, GPU, lav', notes: 'a; b', customer: 'Acme / Other', confidence: 'low', needs_review: true })
  })
})

describe('sample sheet mapping (America/Denver)', () => {
  const drafts = pairSingleLegRows(SAMPLE_SHEET.rows).map((p) =>
    mapExtractedRowToFlightDraft(p.row, { sheetDate: SAMPLE_SHEET.sheet_date, timeZone: 'America/Denver' })
  )

  it('maps the 4 flights with local offsets, direction and quick-turn', () => {
    expect(drafts.map((d) => [d.tailNumber, d.direction, d.scheduledArrivalTime, d.scheduledDepartureTime, d.isQuickTurn])).toEqual([
      ['N509CQ', 'departure_only', null, '2026-11-04T10:00:00-07:00', false],
      ['N868CB', 'both', '2026-11-04T11:00:00-07:00', '2026-11-04T12:00:00-07:00', true],
      ['N33PX', 'departure_only', null, '2026-11-10T12:00:00-07:00', false],
      ['N555HM', 'both', '2026-11-21T12:14:00-07:00', '2026-11-26T16:00:00-07:00', false]
    ])
    expect(drafts.every((d) => d.importable)).toBe(true)
  })

  it('keeps the free-text type and flags it, maps the car to rental_car and keeps the rest in notes', () => {
    expect(drafts[0]).toMatchObject({ aircraftTypeRaw: 'G-IVSP', aircraftTypeIcao: null })
    expect(drafts[0].reviewReasons).toContain('unknown_aircraft_type')
    expect(drafts[0].notes).toContain('Confirmed 11/04/2026')
    expect(drafts[3].services).toEqual(['rental_car'])
    expect(drafts[3].notes).toContain('Fullsize Hertz - Status: Confirmed')
  })
})
