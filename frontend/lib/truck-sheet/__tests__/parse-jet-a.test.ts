import { describe, expect, it } from 'vitest'
import { pageAngleDegrees, parseJetA } from '../parse-jet-a'
import { COL_X, hand, headerBoxes, page, rowLabels, ROW0, rowY, sheetBoxes } from './synthetic'

// 5000 gal start; row 1 pumps 110 (meter 1000 -> 1110), row 2 pumps 1219, row 3 a tank fill back to 5000.
const GOOD = [
  { customer: 'Alpha', tail: 'N123AB', type: 'PC12', start: '12893511', end: '12893621', gallons: '110', starting: '4890', prist: '55/S', tech: 'TT', invoice: '22773', time: '0420' },
  { customer: 'Bravo', tail: 'N45CD', type: 'C172', start: '12893621', end: '12894840', gallons: '1219', starting: '3671', prist: 'T/O', tech: 'KG', invoice: '22774', time: '0550' },
  { customer: 'T4', gallons: '1329', starting: '5000', tech: 'AK', time: '1250' }
]

describe('parseJetA', () => {
  it('reads the header and assigns handwriting to the right row and column', () => {
    const s = parseJetA(page(sheetBoxes(GOOD)))
    expect(s).toMatchObject({
      sheet_date: '2026-08-19',
      truck_number: '5282',
      fuel_type: 'jet_a',
      gallons_down: '0',
      starting_gallons: '5000',
      front_meter_start: '12893511',
      rear_meter_start: '',
      fueler_initials: 'TT'
    })
    expect(s.readings).toHaveLength(3)
    expect(s.readings[0]).toMatchObject({
      reading_type: 'fueling', customer: 'Alpha', tail_number: 'N123AB', aircraft_type: 'PC12', meter: 'front',
      meter_start: '12893511', meter_end: '12893621', gallons_pumped: '110', gallons_remaining: '4890',
      req_gals_or_lbs: '55/S', line_tech_initials: 'TT', invoice_number: '22773', service_time: '0420'
    })
    expect(s.readings[1]).toMatchObject({ customer: 'Bravo', req_gals_or_lbs: 'T/O', line_tech_initials: 'KG', service_time: '0550' })
    expect(s.readings[0].needs_review).toBeUndefined()
    expect(s.readings[1].needs_review).toBeUndefined()
  })

  it('classifies a tank fill and keeps the printed "Gals. Remaining / Prist?" labels out of the cells', () => {
    const s = parseJetA(page(sheetBoxes(GOOD)))
    expect(s.readings[2]).toMatchObject({ reading_type: 'tank_fill', customer: 'T4', gallons_pumped: '1329', gallons_remaining: '5000', req_gals_or_lbs: '' })
  })

  it.each([90, 180, 270, -90, 7, -4])('reads a page rotated %i degrees the same as an upright one', (deg) => {
    const upright = parseJetA(page(sheetBoxes(GOOD), 0))
    const rotated = parseJetA(page(sheetBoxes(GOOD), deg))
    expect(rotated).toEqual(upright)
  })

  it('detects the page angle from word corners', () => {
    expect(Math.round(pageAngleDegrees(page(sheetBoxes(GOOD), 90).words))).toBe(90)
    expect(Math.abs(Math.round(pageAngleDegrees(page(sheetBoxes(GOOD), 180).words)))).toBe(180)
  })

  it('returns the header and zero readings for a header-only page, inventing no rows', () => {
    const s = parseJetA(page([...headerBoxes({ truck: '5197', down: '4670', front: '2505451', rear: '105433' }), ...rowLabels(), { text: '3304', cx: COL_X.starting, cy: ROW0 - 70 }]))
    expect(s.readings).toEqual([])
    expect(s).toMatchObject({ truck_number: '5197', gallons_down: '4670', front_meter_start: '2505451', rear_meter_start: '105433' })
  })

  it('returns an empty sheet when the page is not a truck sheet', () => {
    const s = parseJetA(page([{ text: 'Hello', cx: 100, cy: 100 }, { text: 'world', cx: 300, cy: 100 }]))
    expect(s.readings).toEqual([])
    expect(s.truck_number).toBe('')
  })

  it('reads a raised trailing digit as tenths', () => {
    const rows = [{ ...GOOD[0], start: '108413', end: '108413', gallons: '110', starting: '4890' }]
    const boxes = sheetBoxes(rows).filter((b) => !(b.cx === COL_X.start && b.cy === rowY(0) + 38) && !(b.cx === COL_X.end && b.cy === rowY(0) + 38))
    boxes.push(
      { text: '108413', cx: COL_X.start, cy: rowY(0) + 38 }, { text: '4', cx: COL_X.start + 60, cy: rowY(0) + 20, h: 14 },
      { text: '108523', cx: COL_X.end, cy: rowY(0) + 38 }, { text: '4', cx: COL_X.end + 60, cy: rowY(0) + 20, h: 14 }
    )
    const r = parseJetA(page(boxes, 0)).readings[0]
    expect(r.meter_start).toBe('108413.4')
    expect(r.meter_end).toBe('108523.4')
  })

  it('splits a word glued across two columns (gallons + remaining)', () => {
    // "1219" then "3671" written touching: Vision returns one word centred on the column boundary
    const boxes = sheetBoxes(GOOD).filter((b) => !(b.text === '1219' || b.text === '3671'))
    boxes.push({ text: '12193671', cx: 1940, cy: rowY(1) + 38 })
    const r = parseJetA(page(boxes, 0)).readings[1]
    expect(r.gallons_pumped).toBe('1219')
    expect(r.gallons_remaining).toBe('3671')
  })

  it('tells the front and rear meters apart', () => {
    const rows = [
      { customer: 'Rear', tail: 'N1', start: '105433', end: '105543', gallons: '110', starting: '4890' },
      { customer: 'Front', tail: 'N2', start: '2505451', end: '2505551', gallons: '100', starting: '4790' }
    ]
    const s = parseJetA(page(sheetBoxes(rows, { front: '2505451', rear: '105433' })))
    expect(s.readings.map((r) => r.meter)).toEqual(['rear', 'front'])
    expect(s.readings.every((r) => !r.needs_review)).toBe(true)
  })

  it('accepts a handwritten Xfer row written across the customer, tail and type boxes', () => {
    const rows = [{ ...GOOD[0] }, { gallons: '300', starting: '5190', time: '1000', tech: 'AK' }]
    const boxes = [
      ...sheetBoxes(rows),
      { text: 'Xfer', cx: COL_X.customer, cy: rowY(1) + 38 }, { text: 'from', cx: COL_X.customer + 80, cy: rowY(1) + 38 }, { text: '8370', cx: COL_X.tail, cy: rowY(1) + 38 }
    ]
    const r = parseJetA(page(boxes)).readings[1]
    expect(r).toMatchObject({ reading_type: 'transfer_in', tail_number: '8370', customer: 'Xfer from' })
  })
})

describe('arithmetic repair and flags', () => {
  it('flags a row whose meter math is off and leaves ambiguous values as read', () => {
    const rows = [{ ...GOOD[0], gallons: '115', starting: '' }] // end - start = 110 but pumped 115, no other check to decide
    const r = parseJetA(page(sheetBoxes(rows, {}, ''))).readings[0]
    // end (621 -> 626) or pumped (115 -> 110) could each be changed by one digit: not unique, so nothing is guessed
    expect(r.needs_review).toBe(true)
    expect(r.review_notes).toMatch(/end - start must equal gallons pumped/)
    expect(r.gallons_pumped).toBe('115')
  })

  it('repairs a single wrong digit when exactly one change satisfies every check', () => {
    const rows = [GOOD[0], { ...GOOD[1], start: '12893821' }, GOOD[2]] // row 2 start misread (621 -> 821)
    const s = parseJetA(page(sheetBoxes(rows)))
    expect(s.readings[1].meter_start).toBe('12893621')
    expect(s.readings[1].needs_review).toBe(true)
    expect(s.readings[1].review_notes).toMatch(/meter start corrected from 12893821 to 12893621/)
  })

  it('repairs a dropped digit (insertion)', () => {
    const rows = [GOOD[0], { ...GOOD[1], start: '1289362' }, GOOD[2]]
    expect(parseJetA(page(sheetBoxes(rows))).readings[1].meter_start).toBe('12893621')
  })

  it('does not repair a value that needs more than one digit changed', () => {
    const rows = [GOOD[0], { ...GOOD[1], start: '12890000' }, GOOD[2]]
    const r = parseJetA(page(sheetBoxes(rows))).readings[1]
    expect(r.meter_start).toBe('12890000')
    expect(r.needs_review).toBe(true)
  })

  it('checks the gallons-remaining chain from the shaded starting box and repairs one wrong digit', () => {
    const rows = [GOOD[0], { ...GOOD[1], starting: '3871' }, GOOD[2]]
    const r = parseJetA(page(sheetBoxes(rows))).readings[1]
    expect(r.gallons_remaining).toBe('3671')
  })

  it('flags the first row when its meter start differs from the header start', () => {
    const rows = [{ ...GOOD[0], start: '12893500', end: '12893610' }]
    const r = parseJetA(page(sheetBoxes(rows))).readings[0]
    expect(r.needs_review).toBe(true)
  })

  it('does not flag a consistent sheet', () => {
    expect(parseJetA(page(sheetBoxes(GOOD))).readings.some((r) => r.needs_review)).toBe(false)
  })

  it('flags an initials cell that is not two letters', () => {
    const rows = [{ ...GOOD[0], tech: 'K4' }]
    expect(parseJetA(page(sheetBoxes(rows))).readings[0].review_notes).toMatch(/initials read as "K4"/)
  })

  it('moves a time written alone on the top line of the invoice cell to the time field', () => {
    const rows = [{ ...GOOD[0], invoice: '0420', time: '' }]
    const r = parseJetA(page(sheetBoxes(rows))).readings[0]
    expect(r.service_time).toBe('0420')
    expect(r.invoice_number).toBe('')
  })

  it('ignores a completely blank sheet body', () => {
    expect(parseJetA(page([...headerBoxes(), ...rowLabels()])).readings).toEqual([])
  })

  it('hand() places writing in the expected row band', () => {
    expect(hand(2, { customer: 'x' })[0].cy).toBeGreaterThan(rowY(2))
  })
})
