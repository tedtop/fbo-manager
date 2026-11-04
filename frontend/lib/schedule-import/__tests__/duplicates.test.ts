import { describe, expect, it } from 'vitest'
import { findDuplicateFlight } from '../duplicates'
import { mapExtractedRowToFlightDraft } from '../map-row'
import type { ExistingFlightLike, ScheduleFlightDraft } from '../types'
import { row } from './fixtures'

const OPTS = { timeZone: 'America/Phoenix', sheetDate: '2026-11-05' }
const draftOf = (over: Parameters<typeof row>[0]) => mapExtractedRowToFlightDraft(row(over), OPTS)

function flight(over: Partial<ExistingFlightLike> = {}): ExistingFlightLike {
  return {
    id: 1,
    tail_number: 'N116FE',
    scheduled_arrival_time: '2026-11-05T16:00:00+00:00', // 09:00 Phoenix
    scheduled_departure_time: '2026-11-06T00:30:00+00:00', // 17:30 Phoenix
    contact_name: 'Acme Aviation',
    services: ['fuel'],
    deleted_at: null,
    ...over
  }
}

describe('findDuplicateFlight', () => {
  const d = draftOf({ arrival_time: '09:00', departure_time: '17:30', services: 'fuel' })

  it('no flights for the tail: add', () => {
    expect(findDuplicateFlight(d, [flight({ tail_number: 'N999ZZ' })])).toMatchObject({ match: null, suggestion: 'add' })
    expect(findDuplicateFlight(d, [])).toMatchObject({ match: null, suggestion: 'add' })
  })

  it('same tail and same times: skip', () => {
    const r = findDuplicateFlight(d, [flight()])
    expect(r.match?.id).toBe(1)
    expect(r.suggestion).toBe('skip')
    expect(r.fills).toEqual([])
    expect(r.conflicts).toEqual([])
  })

  it('tail comparison ignores case, spaces and dashes', () => {
    expect(findDuplicateFlight(d, [flight({ tail_number: 'n-116-fe' })]).suggestion).toBe('skip')
  })

  it('same tail but outside the window: add (a second visit)', () => {
    const later = draftOf({ arrival_time: '19:00', departure_time: '20:00' })
    expect(findDuplicateFlight(later, [flight()]).suggestion).toBe('add')
  })

  it('windowMinutes is configurable', () => {
    const near = draftOf({ arrival_time: '10:30', departure_time: '' })
    expect(findDuplicateFlight(near, [flight({ scheduled_departure_time: null })], { windowMinutes: 60 }).suggestion).toBe('add')
    expect(findDuplicateFlight(near, [flight({ scheduled_departure_time: null })], { windowMinutes: 120 }).suggestion).toBe('skip')
  })

  it('a time shifted inside the window is a conflict reported but never overwritten: skip', () => {
    const shifted = draftOf({ arrival_time: '09:30', departure_time: '17:30' })
    const r = findDuplicateFlight(shifted, [flight()])
    expect(r.suggestion).toBe('skip')
    expect(r.conflicts).toEqual([
      { field: 'scheduled_arrival_time', existing: '2026-11-05T16:00:00+00:00', incoming: '2026-11-05T09:30:00-07:00' }
    ])
  })

  it('existing arrival-only flight, sheet now has a departure: update fills it', () => {
    const r = findDuplicateFlight(d, [flight({ scheduled_departure_time: null })])
    expect(r.suggestion).toBe('update')
    expect(r.fills).toEqual([
      { field: 'scheduled_departure_time', existing: null, incoming: '2026-11-05T17:30:00-07:00' }
    ])
  })

  it('fills an empty customer and missing services', () => {
    const r = findDuplicateFlight(
      draftOf({ arrival_time: '09:00', departure_time: '17:30', services: 'fuel, gpu' }),
      [flight({ contact_name: '', services: ['fuel'] })]
    )
    expect(r.suggestion).toBe('update')
    expect(r.fills.map((f) => f.field)).toEqual(['contact_name', 'services'])
    expect(r.fills[1].incoming).toEqual(['gpu'])
  })

  it('a different customer name is a conflict, not an update', () => {
    const r = findDuplicateFlight(d, [flight({ contact_name: 'Someone Else' })])
    expect(r.suggestion).toBe('skip')
    expect(r.conflicts.map((c) => c.field)).toEqual(['contact_name'])
  })

  it('ignores soft-deleted flights but still matches cancelled ones', () => {
    expect(findDuplicateFlight(d, [flight({ deleted_at: '2026-11-05T00:00:00Z' })]).suggestion).toBe('add')
  })

  it('picks the closest of several candidates', () => {
    const r = findDuplicateFlight(d, [
      flight({ id: 1, scheduled_arrival_time: '2026-11-05T17:30:00+00:00' }), // 10:30 local, 90 min away
      flight({ id: 2, scheduled_arrival_time: '2026-11-05T16:10:00+00:00' }) // 10 min away
    ])
    expect(r.match?.id).toBe(2)
    expect(r.candidateCount).toBe(2)
  })

  it('a departure-only draft matches on departure time only', () => {
    const pull = draftOf({ departure_time: '17:30' })
    expect(findDuplicateFlight(pull, [flight()]).suggestion).toBe('skip')
    expect(findDuplicateFlight(draftOf({ departure_time: '23:00' }), [flight()]).suggestion).toBe('add')
  })

  it('a draft with no tail never matches', () => {
    expect(findDuplicateFlight({ ...d, tailNumber: '' }, [flight({ tail_number: '' })]).suggestion).toBe('add')
  })
})

describe('re-importing the same sheet', () => {
  const sheetRows = [
    row({ tail_number: 'N116FE', arrival_time: '09:00', departure_time: '09:45', customer: 'Acme', services: 'fuel, lav' }),
    row({ tail_number: 'N446FM', aircraft_type: 'PC12', customer: 'Greg', departure_time: '06:15', notes: 'T/O top off', services: 'T/O' }),
    row({ tail_number: 'N77AB', arrival_time: '14:00', departure_time: 'TBD' })
  ]
  const drafts = sheetRows.map((r) => mapExtractedRowToFlightDraft(r, OPTS))

  // What importing those drafts creates (flights.repo rows).
  let nextId = 100
  const imported: ExistingFlightLike[] = drafts.map((x) => ({
    id: nextId++,
    tail_number: x.tailNumber,
    scheduled_arrival_time: x.scheduledArrivalTime,
    scheduled_departure_time: x.scheduledDepartureTime,
    is_quick_turn: x.isQuickTurn,
    contact_name: x.customer,
    services: x.services,
    deleted_at: null
  }))

  it('first import on an empty board: every row is an add', () => {
    expect(drafts.map((x) => findDuplicateFlight(x, []).suggestion)).toEqual(['add', 'add', 'add'])
  })

  it('second import of the same sheet: zero adds, all skips', () => {
    const results = drafts.map((x) => findDuplicateFlight(x, imported))
    expect(results.filter((r) => r.suggestion === 'add')).toHaveLength(0)
    expect(results.map((r) => r.suggestion)).toEqual(['skip', 'skip', 'skip'])
  })

  it('stays idempotent when staff edited the board times after the first import', () => {
    const edited = imported.map((f) => ({
      ...f,
      scheduled_arrival_time: f.scheduled_arrival_time ? new Date(Date.parse(f.scheduled_arrival_time) + 30 * 60000).toISOString() : null
    }))
    const results = drafts.map((x) => findDuplicateFlight(x, edited))
    expect(results.filter((r) => r.suggestion === 'add')).toHaveLength(0)
  })

  it('a tail listed twice on one sheet is caught when accepted drafts join the pool', () => {
    const twice: ScheduleFlightDraft[] = [drafts[0], { ...drafts[0] }]
    const pool: ExistingFlightLike[] = []
    const suggestions = twice.map((x, i) => {
      const r = findDuplicateFlight(x, pool)
      if (r.suggestion === 'add') {
        pool.push({
          id: `draft-${i}`,
          tail_number: x.tailNumber,
          scheduled_arrival_time: x.scheduledArrivalTime,
          scheduled_departure_time: x.scheduledDepartureTime,
          contact_name: x.customer,
          services: x.services
        })
      }
      return r.suggestion
    })
    expect(suggestions).toEqual(['add', 'skip'])
  })
})
