import { describe, expect, it, vi } from 'vitest'
import { executeImportOperations, requestScheduleExtraction, type ImportDeps } from '../use-schedule-import'
import type { ImportOperation } from '@/lib/schedule-import/review'

const insert = (tail: string) => ({
  tail_number: tail,
  scheduled_arrival_time: '2026-11-04T11:00:00-07:00',
  scheduled_departure_time: null,
  is_quick_turn: false,
  flight_status: 'scheduled' as const,
  origin: '',
  destination: '',
  contact_name: '',
  contact_notes: '',
  services: [],
  fuel_order_notes: '',
  notes: '',
  created_by_source: 'front-desk' as const
})
const add = (itemId: string, tail: string, serviceKeys: string[] = []): ImportOperation => ({
  kind: 'add',
  itemId,
  tailNumber: tail,
  aircraftTypeDisplay: 'Gulfstream IV',
  aircraftTypeIcao: 'GLF4',
  insert: insert(tail),
  serviceKeys
})

function deps(over: Partial<ImportDeps> = {}): ImportDeps & { calls: string[] } {
  const calls: string[] = []
  let id = 0
  return {
    calls,
    aircraftExists: vi.fn(async (t: string) => {
      calls.push(`exists:${t}`)
      return t === 'NOLD'
    }),
    createAircraft: vi.fn(async (t: string, d: string, i: string) => {
      calls.push(`aircraft:${t}:${d}:${i}`)
    }),
    createFlight: vi.fn(async (f) => {
      calls.push(`flight:${f.tail_number}`)
      return ++id
    }),
    updateFlight: vi.fn(async (fid: number) => {
      calls.push(`update:${fid}`)
    }),
    setServices: vi.fn(async (fid: number, keys: string[]) => {
      calls.push(`services:${fid}:${keys.join('+')}`)
    }),
    ...over
  }
}

describe('executeImportOperations', () => {
  it('creates the aircraft (with the looked-up type) before the flight, once per tail, never touching an existing one', async () => {
    const d = deps()
    const out = await executeImportOperations([add('a', 'N1'), add('b', 'N1', ['fuel']), add('c', 'NOLD')], (i) => i, d)
    expect(out).toMatchObject({ added: 3, updated: 0, failed: [] })
    expect(d.calls).toEqual([
      'exists:N1', 'aircraft:N1:Gulfstream IV:GLF4', 'flight:N1',
      'flight:N1', 'services:2:fuel',
      'exists:NOLD', 'flight:NOLD'
    ])
  })

  it('fill-updates write only what the plan says, with the concurrency token, then the merged services', async () => {
    const d = deps()
    const op: ImportOperation = {
      kind: 'update', itemId: 'u', flightId: 9, expectedUpdatedAt: 't0',
      updates: { contact_name: 'Acme' }, serviceKeys: ['fuel', 'gpu']
    }
    const out = await executeImportOperations([op], (i) => i, d)
    expect(out).toMatchObject({ added: 0, updated: 1, failed: [] })
    expect(d.updateFlight).toHaveBeenCalledWith(9, { contact_name: 'Acme' }, 't0')
    expect(d.calls).toEqual(['update:9', 'services:9:fuel+gpu'])
  })

  it('a failing row is reported and the others still import; a services failure keeps the flight counted', async () => {
    const d = deps({
      createFlight: vi.fn(async (f) => {
        if (f.tail_number === 'N2') throw new Error('boom')
        return 1
      }),
      setServices: vi.fn(async () => {
        throw new Error('rpc down')
      })
    })
    const out = await executeImportOperations([add('a', 'N1', ['fuel']), add('b', 'N2'), add('c', 'N3')], (i) => i.toUpperCase(), d)
    expect(out.added).toBe(2)
    expect(out.failed.map((f) => [f.itemId, f.message.includes('boom') || f.message.includes('services were not saved')])).toEqual([
      ['a', true],
      ['b', true]
    ])
  })
})

describe('requestScheduleExtraction', () => {
  const file = new File(['x'], 'sheet.jpg', { type: 'image/jpeg' })
  it('sends every file as a `file` field and returns the sheet', async () => {
    const sheet = { sheet_date: null, date_range_start: null, date_range_end: null, source_software_hint: '', rows: [] }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(sheet), { status: 200 }))
    await expect(requestScheduleExtraction([file, file])).resolves.toEqual(sheet)
    const body = spy.mock.calls[0][1]?.body as FormData
    expect(body.getAll('file')).toHaveLength(2)
    spy.mockRestore()
  })

  it('surfaces the route error message (502) and handles a dead network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' }), { status: 502 }))
    await expect(requestScheduleExtraction([file])).rejects.toThrow('Extraction failed. Check ANTHROPIC_API_KEY')
    spy.mockRejectedValueOnce(new TypeError('offline'))
    await expect(requestScheduleExtraction([file])).rejects.toThrow(/Could not reach the server/)
    spy.mockRestore()
  })
})
