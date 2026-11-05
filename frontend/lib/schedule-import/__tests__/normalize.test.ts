import { describe, expect, it } from 'vitest'
import {
  isPlausibleTail,
  mergeScheduleSheets,
  normalizeScheduleSheet,
  normalizeTail,
  parseDate,
  parseTime
} from '../normalize'
import { RAW_MODEL_JSON, row } from './fixtures'

describe('normalizeTail', () => {
  it.each([
    ['N 116 FE', 'N116FE'],
    ['n-116-fe', 'N116FE'],
    [' N116FE ', 'N116FE'],
    ['C-GABC', 'CGABC'],
    [null, '']
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTail(input)).toBe(expected)
  })
})

describe('isPlausibleTail', () => {
  it.each(['N116FE', 'N12345', 'N1234A', 'N12AB', 'N1', 'N446FM', 'CGABC', 'XAABC'])('accepts %s', (t) => {
    expect(isPlausibleTail(t)).toBe(true)
  })
  it.each(['', 'N', 'N0123', 'N1I6FE', 'N1O6FE', 'N123456', 'N12ABC', 'N116F3', '12345'])('rejects %s', (t) => {
    expect(isPlausibleTail(t)).toBe(false)
  })
})

describe('parseTime', () => {
  it.each([
    ['0545', '05:45'],
    ['545', '05:45'],
    ['5:45', '05:45'],
    ['17:45', '17:45'],
    ['1745L', '17:45'],
    ['5:45 PM', '17:45'],
    ['5:45p', '17:45'],
    ['12:05 AM', '00:05'],
    ['12:30 PM', '12:30'],
    ['0000', '00:00']
  ])('%s -> %s', (input, expected) => {
    expect(parseTime(input)).toBe(expected)
  })
  it.each(['', 'soon', '2400', '25:00', '12:75', '0930Z', '13:00 PM', '1:7x'])('rejects %s', (input) => {
    expect(parseTime(input)).toBeNull()
  })
})

describe('parseDate', () => {
  it('parses ISO, US slash dates and a weekday prefix', () => {
    expect(parseDate('2026-11-05')).toBe('2026-11-05')
    expect(parseDate('11/5/2026')).toBe('2026-11-05')
    expect(parseDate('11/05/26')).toBe('2026-11-05')
    expect(parseDate('Thu 11/05', 2026)).toBe('2026-11-05')
    expect(parseDate('Thursday, 11/05/2026')).toBe('2026-11-05')
  })
  it('needs a year for month/day only, and rejects impossible dates', () => {
    expect(parseDate('11/05')).toBeNull()
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseDate('13/01/2026')).toBeNull()
    expect(parseDate('whenever')).toBeNull()
  })
})

describe('normalizeScheduleSheet', () => {
  const sheet = normalizeScheduleSheet(RAW_MODEL_JSON, 'raw')

  it('cleans sheet-level fields', () => {
    expect(sheet.sheet_date).toBeNull()
    expect(sheet.date_range_start).toBe('2026-11-05')
    expect(sheet.date_range_end).toBe('2026-11-06')
    expect(sheet.source_software_hint).toBe('FBO Desk Pro')
    expect(sheet.raw_text).toBe('raw')
  })

  it('canonicalizes row fields and drops blank rows and non-objects', () => {
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0]).toMatchObject({
      tail_number: 'N116FE',
      aircraft_type: 'C525',
      customer: 'Acme Aviation',
      group_date: '2026-11-05',
      arrival_time: '09:30',
      departure_time: '17:45',
      confidence: 'high',
      page: 1
    })
    expect(sheet.rows[1]).toMatchObject({
      tail_number: 'N446FM',
      arrival_time: '', // TBD placeholder is "blank", not an error
      departure_time: '06:15',
      notes: 'T/O top off',
      confidence: 'medium', // unknown value falls back
      page: 2
    })
  })

  it('keeps unparseable times verbatim for the mapper to flag', () => {
    const s = normalizeScheduleSheet({ rows: [{ tail_number: 'N1A', arrival_time: '0930Z' }] })
    expect(s.rows[0].arrival_time).toBe('0930Z')
  })

  it('never throws on garbage', () => {
    for (const bad of [null, undefined, 42, 'x', [], { rows: 'nope' }]) {
      expect(normalizeScheduleSheet(bad).rows).toEqual([])
    }
  })
})

describe('mergeScheduleSheets', () => {
  const a = { ...normalizeScheduleSheet({ sheet_date: '2026-11-05', source_software_hint: 'X', rows: [{ tail_number: 'N1A' }] }) }
  const b = { ...normalizeScheduleSheet({ sheet_date: '2026-11-05', rows: [{ tail_number: 'N2B' }] }) }
  const c = { ...normalizeScheduleSheet({ sheet_date: '2026-11-06', rows: [{ tail_number: 'N3C' }] }) }

  it('keeps a single sheet_date, concatenates rows and numbers pages by file', () => {
    const m = mergeScheduleSheets([a, b])
    expect(m.sheet_date).toBe('2026-11-05')
    expect(m.date_range_start).toBeNull()
    expect(m.source_software_hint).toBe('X')
    expect(m.rows.map((r) => [r.tail_number, r.page])).toEqual([
      ['N1A', 1],
      ['N2B', 2]
    ])
  })

  it('turns differing dates into a range', () => {
    const m = mergeScheduleSheets([a, c])
    expect(m.sheet_date).toBeNull()
    expect(m.date_range_start).toBe('2026-11-05')
    expect(m.date_range_end).toBe('2026-11-06')
  })

  it('handles sheets with no dates', () => {
    const m = mergeScheduleSheets([normalizeScheduleSheet({ rows: [row()] })])
    expect(m.sheet_date).toBeNull()
    expect(m.date_range_start).toBeNull()
  })
})

describe('normalizeScheduleSheet origin and destination', () => {
  it('keeps printed airports (or from/to aliases), upper case; blank tokens and absent columns add no key', () => {
    const sheet = normalizeScheduleSheet({
      rows: [
        { tail_number: 'N1A', origin: ' sea ', destination: 'mso', arrival_time: '0900' },
        { tail_number: 'N2B', from: 'KBZN', to: '-', arrival_time: '0900' },
        { tail_number: 'N3C', coming_from: 'Boise ID', next_stop: 'tbd', arrival_time: '0900' },
        { tail_number: 'N4D', arrival_time: '0900' }
      ]
    })
    expect(sheet.rows[0]).toMatchObject({ origin: 'SEA', destination: 'MSO' })
    expect(sheet.rows[1].origin).toBe('KBZN')
    expect('destination' in sheet.rows[1]).toBe(false)
    expect(sheet.rows[2].origin).toBe('BOISE ID')
    expect('origin' in sheet.rows[3]).toBe(false)
  })
})
