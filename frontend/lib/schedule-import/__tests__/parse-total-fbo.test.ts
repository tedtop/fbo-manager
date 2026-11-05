import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTotalFboText } from '../parse-total-fbo'
import { pairSingleLegRows } from '../pair-legs'
import { SAMPLE_SHEET } from './sample-sheet'

const PHOTO_TEXT = readFileSync(path.join(__dirname, 'total-fbo-photo.txt'), 'utf8')

describe('parseTotalFboText on the real Tesseract output of the sample photo', () => {
  const parsed = parseTotalFboText(PHOTO_TEXT)
  const rows = parsed.sheet.rows

  it('recognises the report and reads the header', () => {
    expect(parsed.recognised).toBe(true)
    expect(parsed.sheet.date_range_start).toBe('2026-11-04')
    expect(parsed.sheet.date_range_end).toBe('2026-11-30')
    expect(parsed.sheet.sheet_date).toBe('2026-11-04')
    expect(parsed.sheet.source_software_hint).toBe('Minuteman Aviation Inc - Scheduled Arrivals and Requests')
  })

  it('finds exactly the six rows, in order, no invented ones', () => {
    expect(rows.map((r) => `${r.arrival_date || r.departure_date} ${r.arrival_time || r.departure_time} ${r.arrival_time ? 'A' : 'D'} ${r.tail_number}`)).toEqual([
      '2026-11-04 10:00 D N509CQ',
      '2026-11-04 11:00 A N868CB',
      '2026-11-04 12:00 D N868CB',
      '2026-11-10 12:00 D N33PX',
      '2026-11-21 12:14 A N555HM',
      '2026-11-26 16:00 D N555HM'
    ])
  })

  it('matches the ground-truth extraction on every field the review screen uses', () => {
    rows.forEach((r, i) => {
      const e = SAMPLE_SHEET.rows[i]
      expect(r.tail_number).toBe(e.tail_number)
      expect(r.aircraft_type).toBe(e.aircraft_type)
      expect(r.customer).toBe(e.customer)
      expect(r.arrival_date).toBe(e.arrival_date)
      expect(r.arrival_time).toBe(e.arrival_time)
      expect(r.departure_date).toBe(e.departure_date)
      expect(r.departure_time).toBe(e.departure_time)
      expect(r.services).toBe(e.services)
      expect(r.notes).toBe(e.notes)
    })
  })

  it('flags only the repaired date as needing review', () => {
    expect(rows.map((r) => r.needs_review)).toEqual([false, false, false, false, false, true])
    expect(rows[5].confidence).toBe('medium')
    expect(rows[4].confidence).toBe('medium') // "Arive" and a clipped customer: cosmetic repairs only
    expect(rows[0].confidence).toBe('high')
  })

  it('pairs into the four flights the sample is known to produce', () => {
    expect(pairSingleLegRows(rows)).toHaveLength(4)
  })
})

function sheet(...lines: string[]) {
  return parseTotalFboText(
    ['Run: 11/04/2026 Acme Aviation Page: 1', 'Scheduled Arrivals and Requests', 'For The Period: 11/04/2026 Through: 11/30/2026', ...lines].join('\n')
  ).sheet.rows
}

describe('parseTotalFboText fuzziness', () => {
  it('flags a suspicious tail instead of guessing', () => {
    const [r] = sheet('11/21/2026 12:14PM Arive N5S5HM BRAVO Cash/Check Customer')
    expect(r.tail_number).toBe('N5S5HM')
    expect(r.needs_review).toBe(true)
  })

  it('accepts "Arive" without review and normalises tail case', () => {
    const [r] = sheet('11/21/2026 1:14 PM Arive n555hm BRAVO Cash/Check Customer')
    expect(r.arrival_time).toBe('13:14')
    expect(r.needs_review).toBe(false)
  })

  it('converts 12 AM / 12 PM and 24 h results correctly', () => {
    const rows = sheet('11/05/2026 12:30AM Arrive N1AB CJ2 Foo Bar', '11/05/2026 12:30PM Depart N1AB CJ2 Foo Bar')
    expect(rows[0].arrival_time).toBe('00:30')
    expect(rows[1].departure_time).toBe('12:30')
  })

  it('flags a time with no AM/PM', () => {
    const [r] = sheet('11/05/2026 4:00 Depart N33PX ENCORE Foo Bar')
    expect(r.needs_review).toBe(true)
  })

  it('flags a date outside the period that cannot be repaired', () => {
    const [r] = sheet('12/25/2026 4:00PM Depart N33PX ENCORE Foo Bar')
    expect(r.needs_review).toBe(true)
  })

  it('ignores garbage lines and lines before any row', () => {
    const rows = sheet('~~ aa 1 #', '11/05/2026 4:00PM Depart N33PX ENCORE Foo Bar', 'x;# EE ,', 'Ry CE')
    expect(rows).toHaveLength(1)
    expect(rows[0].services).toBe('')
  })

  it('keeps a row whose action is unreadable, flagged', () => {
    const [r] = sheet('11/05/2026 4:00PM ~~ N33PX ENCORE Foo Bar')
    expect(r.needs_review).toBe(true)
  })

  it('does not recognise an unrelated sheet and finds no rows', () => {
    const p = parseTotalFboText('Daily Fuel Log\nTank 1  4500 gal\nTank 2  3200 gal')
    expect(p.recognised).toBe(false)
    expect(p.rowCount).toBe(0)
  })
})
