import { describe, expect, it } from 'vitest'
import {
  buildReviewItems,
  canImport,
  evaluateReviewItems,
  existingFlightsRange,
  planImport,
  summarizeReview,
  unpairItem,
  type ReviewExistingFlight
} from '../review'
import { SAMPLE_SHEET } from './sample-sheet'

const TZ = { timeZone: 'America/Denver' }

describe('review items from the sample sheet', () => {
  const items = buildReviewItems(SAMPLE_SHEET, TZ)

  it('has 4 flights with wall times in the FBO zone', () => {
    expect(items.map((i) => i.tail)).toEqual(['N509CQ', 'N868CB', 'N33PX', 'N555HM'])
    expect(items[1].arrival).toEqual({ date: '2026-11-04', time: '11:00' })
    expect(items[1].departure).toEqual({ date: '2026-11-04', time: '12:00' })
    expect(items[0].arrival).toEqual({ date: '', time: '' })
    expect(items[3].sourceRows).toHaveLength(2)
  })

  it('on an empty board every row is an add and flagged rows block the import until acknowledged', () => {
    const evals = evaluateReviewItems(items, [], TZ)
    expect(evals.map((e) => e.plan)).toEqual(['add', 'add', 'add', 'add'])
    expect(evals[1]).toMatchObject({ isQuickTurn: true, direction: 'both' })
    expect(evals[3]).toMatchObject({ isQuickTurn: false })
    expect(summarizeReview(evals)).toEqual({ add: 4, update: 0, skip: 0, blocking: 4 }) // unknown free-text types
    expect(canImport(evals)).toBe(false)
    const acked = items.map((i) => ({ ...i, acknowledged: true }))
    expect(canImport(evaluateReviewItems(acked, [], TZ))).toBe(true)
  })

  it('unpair splits a pair back into its printed rows', () => {
    const parts = unpairItem(items[1], SAMPLE_SHEET.sheet_date, TZ)
    expect(parts).toHaveLength(2)
    expect(parts.map((p) => p.sourceRows[0].raw_row_text)).toEqual(items[1].sourceRows.map((r) => r.raw_row_text))
    expect(parts[0]).toMatchObject({ arrival: { date: '2026-11-04', time: '11:00' }, departure: { date: '', time: '' } })
    expect(parts[1]).toMatchObject({ departure: { date: '2026-11-04', time: '12:00' } })
    expect(unpairItem(items[0], null, TZ)).toEqual([items[0]])
  })

  it('range for the board lookup spans the sheet padded by one day', () => {
    expect(existingFlightsRange(items)).toEqual({ startDate: '2026-11-03', endDate: '2026-11-27' })
    expect(existingFlightsRange([])).toBeNull()
  })
})

describe('re-importing the same sheet', () => {
  const items = buildReviewItems(SAMPLE_SHEET, TZ).map((i) => ({ ...i, acknowledged: true }))
  const first = planImport(items, evaluateReviewItems(items, [], TZ), TZ)
  const board: ReviewExistingFlight[] = first.map((op, n) => {
    if (op.kind !== 'add') throw new Error('expected add')
    return {
      id: 100 + n,
      tail_number: op.insert.tail_number,
      scheduled_arrival_time: op.insert.scheduled_arrival_time,
      scheduled_departure_time: op.insert.scheduled_departure_time,
      contact_name: op.insert.contact_name,
      services: op.serviceKeys,
      notes: op.insert.notes,
      updated_at: '2026-11-04T20:00:00Z'
    }
  })

  it('first import writes 4 flights with the expected fields', () => {
    expect(first).toHaveLength(4)
    const turn = first[1]
    expect(turn.kind === 'add' && turn.insert).toMatchObject({
      tail_number: 'N868CB',
      is_quick_turn: true,
      contact_name: 'Buybacks-Contract Fuel',
      created_by_source: 'front-desk',
      flight_status: 'scheduled'
    })
    expect(first[0].kind === 'add' && first[0]).toMatchObject({ aircraftTypeDisplay: 'G-IVSP', aircraftTypeIcao: 'UNKN' })
  })

  it('second pass over the board finds every flight and adds nothing', () => {
    const evals = evaluateReviewItems(items, board, TZ)
    expect(evals.map((e) => e.plan)).toEqual(['skip', 'skip', 'skip', 'skip'])
    expect(evals.every((e) => e.dup.match !== null)).toBe(true)
    expect(planImport(items, evals, TZ)).toEqual([])
  })

  it('a board flight missing the departure and customer is filled, never overwritten', () => {
    const partial: ReviewExistingFlight[] = board.map((f) =>
      f.tail_number === 'N868CB'
        ? { ...f, scheduled_departure_time: null, contact_name: '', services: [], notes: 'staff note' }
        : f.tail_number === 'N555HM'
          ? { ...f, scheduled_arrival_time: '2026-11-21T20:30:00Z' } // staff moved it: conflict, not overwritten
          : f
    )
    const evals = evaluateReviewItems(items, partial, TZ)
    expect(evals.map((e) => e.plan)).toEqual(['skip', 'update', 'skip', 'skip'])
    const ops = planImport(items, evals, TZ)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      kind: 'update',
      flightId: 101,
      expectedUpdatedAt: '2026-11-04T20:00:00Z',
      updates: { scheduled_departure_time: '2026-11-04T12:00:00-07:00', contact_name: 'Buybacks-Contract Fuel', is_quick_turn: true }
    })
    expect(ops[0].kind === 'update' && ops[0].updates.notes).toBeUndefined() // board notes are set: kept
    expect(evals[3].dup.conflicts.map((c) => c.field)).toEqual(['scheduled_arrival_time'])
  })

  it('a tail listed twice on one sheet is added once', () => {
    const twice = [items[1], { ...items[1], id: 'dup' }]
    const evals = evaluateReviewItems(twice, [], TZ)
    expect(evals.map((e) => e.plan)).toEqual(['add', 'skip'])
    expect(evals[1].matchIsSheetRow).toBe(true)
  })

  it('editing a time recomputes quick turn and blocks a departure before the arrival', () => {
    const edited = { ...items[1], departure: { date: '2026-11-04', time: '13:00' } }
    expect(evaluateReviewItems([edited], [], TZ)[0].isQuickTurn).toBe(false)
    const bad = { ...items[1], departure: { date: '2026-11-04', time: '10:00' } }
    const ev = evaluateReviewItems([bad], [], TZ)[0]
    expect(ev.reasons).toContain('departure_before_arrival')
    expect(ev.direction).toBe('arrival_only')
    const none = { ...items[1], arrival: { date: '', time: '' }, departure: { date: '', time: '' } }
    expect(evaluateReviewItems([none], [], TZ)[0]).toMatchObject({ importable: false, plan: 'skip' })
  })

  it('an explicit Add on a duplicate adds a new flight', () => {
    const forced = { ...items[0], actionOverride: 'add' as const, includeOverride: true }
    expect(evaluateReviewItems([forced], board, TZ)[0].plan).toBe('add')
  })
})
