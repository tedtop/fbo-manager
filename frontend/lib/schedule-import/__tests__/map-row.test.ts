import { describe, expect, it } from 'vitest'
import { mapExtractedRowToFlightDraft, parseServices } from '../map-row'
import { row } from './fixtures'

const PHX = { timeZone: 'America/Phoenix', sheetDate: '2026-11-05' }

describe('mapExtractedRowToFlightDraft: a normal row', () => {
  const draft = mapExtractedRowToFlightDraft(
    row({
      tail_number: 'N 116 FE',
      aircraft_type: 'c525',
      customer: '  Acme   Aviation ',
      arrival_time: '09:00',
      departure_time: '17:30',
      services: 'Fuel, GPU, lav, car wash',
      notes: 'Pilot Bob',
      raw_row_text: 'N116FE | C525 | 0900 | 1730'
    }),
    PHX
  )

  it('normalizes tail, type and customer', () => {
    expect(draft.tailNumber).toBe('N116FE')
    expect(draft.aircraftTypeRaw).toBe('c525') // printed text as-is, never mapped
    expect(draft.customer).toBe('Acme Aviation')
  })

  it('inherits the sheet date and writes ISO with the local offset', () => {
    expect(draft.scheduledArrivalTime).toBe('2026-11-05T09:00:00-07:00')
    expect(draft.scheduledDepartureTime).toBe('2026-11-05T17:30:00-07:00')
    expect(draft.direction).toBe('both')
    expect(draft.isQuickTurn).toBe(false)
  })

  it('maps services to catalog keys and keeps unmatched text in notes', () => {
    expect(draft.services).toEqual(['fuel', 'gpu', 'lav'])
    expect(draft.notes).toBe('Pilot Bob; Services: car wash')
  })

  it('is importable and needs no review', () => {
    expect(draft).toMatchObject({ needsReview: false, reviewReasons: [], importable: true })
  })
})

describe('day headers', () => {
  it('uses the row group_date over the sheet date, per row', () => {
    const thu = mapExtractedRowToFlightDraft(row({ group_date: '2026-11-05', arrival_time: '10:00' }), { timeZone: 'America/Phoenix' })
    const fri = mapExtractedRowToFlightDraft(row({ group_date: '2026-11-06', arrival_time: '10:00' }), { timeZone: 'America/Phoenix' })
    expect(thu.scheduledArrivalTime).toBe('2026-11-05T10:00:00-07:00')
    expect(fri.scheduledArrivalTime).toBe('2026-11-06T10:00:00-07:00')
  })

  it('an explicit row date beats the header, and the departure follows the arrival date', () => {
    const d = mapExtractedRowToFlightDraft(
      row({ group_date: '2026-11-05', arrival_date: '2026-11-07', arrival_time: '10:00', departure_time: '15:00' }),
      { timeZone: 'America/Phoenix' }
    )
    expect(d.scheduledArrivalTime).toBe('2026-11-07T10:00:00-07:00')
    expect(d.scheduledDepartureTime).toBe('2026-11-07T15:00:00-07:00')
  })

  it('a departure with its own printed date (multi-day stay) keeps it', () => {
    const d = mapExtractedRowToFlightDraft(
      row({ group_date: '2026-11-05', arrival_time: '10:00', departure_date: '2026-11-08', departure_time: '09:00' }),
      { timeZone: 'America/Phoenix' }
    )
    expect(d.scheduledDepartureTime).toBe('2026-11-08T09:00:00-07:00')
    expect(d.reviewReasons).toEqual([])
  })

  it('month/day-only dates take the year from the heading or the sheet', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_date: '11/06', arrival_time: '08:00' }), PHX)
    expect(d.scheduledArrivalTime).toBe('2026-11-06T08:00:00-07:00')
  })

  it('no heading, no sheet date: missing_date, not importable', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '10:00' }), { timeZone: 'America/Phoenix' })
    expect(d.reviewReasons).toContain('missing_date')
    expect(d.reviewReasons).toContain('no_times')
    expect(d).toMatchObject({ scheduledArrivalTime: null, importable: false, needsReview: true })
  })
})

describe('arrival-only and departure-only (D6)', () => {
  it('arrival only: a returning aircraft, departure unknown, no review needed', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '14:00', departure_time: 'TBD' }), PHX)
    expect(d).toMatchObject({ direction: 'arrival_only', scheduledDepartureTime: null, isQuickTurn: false, needsReview: false })
  })

  it('departure only: pulled from the hangar', () => {
    const d = mapExtractedRowToFlightDraft(row({ departure_time: '06:15' }), PHX)
    expect(d).toMatchObject({
      direction: 'departure_only',
      scheduledArrivalTime: null,
      scheduledDepartureTime: '2026-11-05T06:15:00-07:00',
      isQuickTurn: false,
      needsReview: false,
      importable: true
    })
  })

  it('neither time: no_times and not importable', () => {
    const d = mapExtractedRowToFlightDraft(row(), PHX)
    expect(d).toMatchObject({ direction: 'none', importable: false })
    expect(d.reviewReasons).toEqual(['no_times'])
  })
})

describe('quick turn (arrival and departure <= 60 min apart)', () => {
  const gap = (arr: string, dep: string) =>
    mapExtractedRowToFlightDraft(row({ arrival_time: arr, departure_time: dep }), PHX)

  it('45 and exactly 60 minutes are QT', () => {
    expect(gap('10:00', '10:45').isQuickTurn).toBe(true)
    expect(gap('10:00', '11:00').isQuickTurn).toBe(true)
  })
  it('61 minutes is not', () => {
    expect(gap('10:00', '11:01').isQuickTurn).toBe(false)
  })
  it('same minute is flagged, not a QT', () => {
    const d = gap('10:00', '10:00')
    expect(d.isQuickTurn).toBe(false)
    expect(d.reviewReasons).toEqual(['zero_gap'])
  })
  it('a single time is never a QT', () => {
    expect(mapExtractedRowToFlightDraft(row({ arrival_time: '10:00' }), PHX).isQuickTurn).toBe(false)
  })
})

describe('midnight rollover', () => {
  it('23:30 -> 00:30 rolls the departure to the next day and is a QT', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '23:30', departure_time: '00:30' }), PHX)
    expect(d.scheduledArrivalTime).toBe('2026-11-05T23:30:00-07:00')
    expect(d.scheduledDepartureTime).toBe('2026-11-06T00:30:00-07:00')
    expect(d).toMatchObject({ isQuickTurn: true, needsReview: false, direction: 'both' })
  })

  it('an overnight stay (22:00 -> 06:00) rolls silently', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '22:00', departure_time: '06:00' }), PHX)
    expect(d.scheduledDepartureTime).toBe('2026-11-06T06:00:00-07:00')
    expect(d.needsReview).toBe(false)
  })

  it('a rollover that makes the stay longer than 12 h is flagged (likely a misread time)', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '14:00', departure_time: '13:30' }), PHX)
    expect(d.scheduledDepartureTime).toBe('2026-11-06T13:30:00-07:00')
    expect(d.reviewReasons).toEqual(['rolled_over_long_gap'])
  })

  it('rolls across a month end', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '23:00', departure_time: '01:00' }), { timeZone: 'America/Phoenix', sheetDate: '2026-11-30' })
    expect(d.scheduledDepartureTime).toBe('2026-12-01T01:00:00-07:00')
  })

  it('an explicit departure date earlier than the arrival is never auto-fixed', () => {
    const d = mapExtractedRowToFlightDraft(
      row({ arrival_time: '14:00', departure_date: '2026-11-05', departure_time: '13:00' }),
      PHX
    )
    expect(d.reviewReasons).toEqual(['departure_before_arrival'])
    expect(d).toMatchObject({ direction: 'arrival_only', scheduledDepartureTime: null })
  })
})

describe('DST edges', () => {
  const spring = { timeZone: 'America/New_York', sheetDate: '2026-03-08' }

  it('America/New_York spring-forward: 01:30 EST -> 03:15 EDT is 45 real minutes, so a QT', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '01:30', departure_time: '03:15' }), spring)
    expect(d.scheduledArrivalTime).toBe('2026-03-08T01:30:00-05:00')
    expect(d.scheduledDepartureTime).toBe('2026-03-08T03:15:00-04:00')
    expect(d.isQuickTurn).toBe(true)
    expect(d.needsReview).toBe(false)
  })

  it('America/New_York spring-forward: a time in the gap (02:30) is shifted to 03:30 EDT and flagged', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '02:30' }), spring)
    expect(d.scheduledArrivalTime).toBe('2026-03-08T03:30:00-04:00')
    expect(d.reviewReasons).toEqual(['nonexistent_local_time'])
  })

  it('America/Phoenix has no DST: the same wall times keep -07:00 and 02:30 is not flagged', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '01:30', departure_time: '03:15' }), { timeZone: 'America/Phoenix', sheetDate: '2026-03-08' })
    expect(d.scheduledArrivalTime).toBe('2026-03-08T01:30:00-07:00')
    expect(d.scheduledDepartureTime).toBe('2026-03-08T03:15:00-07:00')
    expect(d.isQuickTurn).toBe(false) // 105 real minutes here
    const gap = mapExtractedRowToFlightDraft(row({ arrival_time: '02:30' }), { timeZone: 'America/Phoenix', sheetDate: '2026-03-08' })
    expect(gap.needsReview).toBe(false)
  })

  it('America/New_York fall-back: 01:30 is ambiguous, first occurrence used, flagged', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '01:30' }), { timeZone: 'America/New_York', sheetDate: '2026-11-01' })
    expect(d.scheduledArrivalTime).toBe('2026-11-01T01:30:00-04:00')
    expect(d.reviewReasons).toEqual(['ambiguous_local_time'])
  })

  it('a stay across the fall-back night uses elapsed time (23:30 -> 00:30 on a 25 h day is still 60 min)', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '23:30', departure_time: '00:30' }), { timeZone: 'America/New_York', sheetDate: '2026-10-31' })
    expect(d.isQuickTurn).toBe(true)
  })
})

describe('needs_review', () => {
  it('an unparseable time is flagged and the other time is kept', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '09:3x', departure_time: '17:00' }), PHX)
    expect(d.reviewReasons).toEqual(['unparseable_time'])
    expect(d).toMatchObject({ scheduledArrivalTime: null, scheduledDepartureTime: '2026-11-05T17:00:00-07:00', direction: 'departure_only' })
  })

  it('a UTC-marked time is not guessed at', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '1630Z' }), PHX)
    expect(d.reviewReasons).toContain('unparseable_time')
    expect(d.importable).toBe(false)
  })

  it('an unparseable date is flagged', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_date: '31/31', arrival_time: '09:00' }), PHX)
    expect(d.reviewReasons).toContain('unparseable_date')
  })

  it('a date with no time is flagged and not turned into a midnight', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_date: '2026-11-06', arrival_time: '' , departure_time: '10:00' }), PHX)
    expect(d.reviewReasons).toContain('date_without_time')
    expect(d.scheduledArrivalTime).toBeNull()
  })

  it('missing and suspicious tails', () => {
    expect(mapExtractedRowToFlightDraft(row({ tail_number: '', arrival_time: '09:00' }), PHX)).toMatchObject({
      importable: false,
      reviewReasons: ['missing_tail']
    })
    expect(mapExtractedRowToFlightDraft(row({ tail_number: 'N1O6FE', arrival_time: '09:00' }), PHX).reviewReasons).toEqual([
      'suspicious_tail'
    ])
  })

  it('the printed type is kept raw for display and never mapped or flagged', () => {
    const d = mapExtractedRowToFlightDraft(row({ aircraft_type: 'CITATION CJ3', arrival_time: '09:00' }), PHX)
    expect(d).toMatchObject({ aircraftTypeRaw: 'CITATION CJ3', reviewReasons: [], needsReview: false })
    expect(d).not.toHaveProperty('aircraftTypeIcao')
    expect(mapExtractedRowToFlightDraft(row({ aircraft_type: '', arrival_time: '09:00' }), PHX).needsReview).toBe(false)
  })

  it('carries the model flag and low confidence', () => {
    const d = mapExtractedRowToFlightDraft(row({ arrival_time: '09:00', needs_review: true, confidence: 'low' }), PHX)
    expect(d.reviewReasons).toEqual(['model_flagged', 'low_confidence'])
    expect(d.importable).toBe(true) // flagged rows can still be imported after review
  })
})

describe('parseServices', () => {
  it('maps synonyms, dedupes, and returns leftovers', () => {
    expect(parseServices('Jet A top off, ground power; LAV | Catering, crew car, wash')).toEqual({
      keys: ['fuel', 'gpu', 'lav', 'catering', 'courtesy_car'],
      unmatched: ['wash']
    })
  })
  it('treats T/O as a top-off fuel request and ignores placeholders', () => {
    expect(parseServices('T/O, TBD')).toEqual({ keys: ['fuel'], unmatched: [] })
  })
})
