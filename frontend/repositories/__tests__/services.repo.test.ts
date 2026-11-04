import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeFlight } from '@/tests/support/factories'
import {
  findAllFlights,
  findFlightById,
  serviceKeysFromRow,
  serviceQuantitiesFromRow,
  updateFlight,
} from '@/repositories/flights.repo'
import { findActiveServices, servicesPayload, setFlightServices } from '@/repositories/services.repo'

// B26b: services.repo + the embedded junction read + the dual write (migration 20261104000200).
const db = createTestClient()

async function readFlight(id: number) {
  const row = await findFlightById(db, id)
  if (!row) throw new Error(`flight ${id} not found`)
  return row
}

beforeEach(async () => {
  await resetDatabase(db)
})

afterEach(async () => {
  await db.from('service').update({ active: true }).eq('key', 'ice')
  await db.from('product').delete().like('sku', 'ZZ-TEST-%')
})

describe('serviceKeysFromRow (adapter)', () => {
  it('maps junction rows to keys in catalog order and ignores rows without a service', () => {
    const keys = serviceKeysFromRow({
      flight_service: [
        { service: { key: 'lav', sort_order: 50 } },
        { service: null },
        { service: { key: 'fuel', sort_order: 10 } },
        { service: { key: 'b_same', sort_order: 60 } },
        { service: { key: 'a_same', sort_order: 60 } },
      ],
    })
    expect(keys).toEqual(['fuel', 'lav', 'a_same', 'b_same'])
  })

  it('returns [] when the embed is missing or empty', () => {
    expect(serviceKeysFromRow({})).toEqual([])
    expect(serviceKeysFromRow({ flight_service: null })).toEqual([])
    expect(serviceKeysFromRow({ flight_service: [] })).toEqual([])
  })
})

describe('serviceQuantitiesFromRow (adapter)', () => {
  it('maps quantities of services that have a unit, skipping plain toggles, NULL quantities and missing services', () => {
    expect(
      serviceQuantitiesFromRow({
        flight_service: [
          { quantity: 12, service: { key: 'tks_fluid', sort_order: 160, quantity_unit: 'gal' } },
          { quantity: 1, service: { key: 'fuel', sort_order: 10, quantity_unit: null } },
          { quantity: 3, service: { key: 'gpu', sort_order: 40 } },
          { quantity: null, service: { key: 'oil', sort_order: 170, quantity_unit: 'qt' } },
          { quantity: 5, service: null },
        ],
      })
    ).toEqual({ tks_fluid: 12 })
  })

  it('returns {} when the embed is missing or empty', () => {
    expect(serviceQuantitiesFromRow({})).toEqual({})
    expect(serviceQuantitiesFromRow({ flight_service: null })).toEqual({})
    expect(serviceQuantitiesFromRow({ flight_service: [] })).toEqual({})
  })
})

describe('servicesPayload', () => {
  it('sends bare keys unless a quantity is given, and de-duplicates', () => {
    expect(servicesPayload(['fuel', 'tks_fluid', 'fuel'], { tks_fluid: 12 })).toEqual(['fuel', { key: 'tks_fluid', quantity: 12 }])
    expect(servicesPayload(['fuel', 'tks_fluid'])).toEqual(['fuel', 'tks_fluid'])
  })
})

describe('findActiveServices', () => {
  it('returns the 16 seeded services in sort_order and hides inactive ones', async () => {
    const all = await findActiveServices(db)
    expect(all).toHaveLength(16)
    expect(all.map((s) => s.sort_order)).toEqual([...all.map((s) => s.sort_order)].sort((a, b) => a - b))
    expect(all[0].key).toBe('fuel')
    expect(all.map((s) => s.key)).toContain('ground_transport')

    await db.from('service').update({ active: false }).eq('key', 'ice')
    const active = await findActiveServices(db)
    expect(active).toHaveLength(15)
    expect(active.map((s) => s.key)).not.toContain('ice')
  })

  it('never lists a billable product that has no service row (ramp fee stays off the board)', async () => {
    const { error } = await db
      .from('product')
      .insert({ sku: 'ZZ-TEST-RAMP', name: 'Ramp Fee', product_type: 'fee', price: 75 } as never)
    expect(error).toBeNull()
    const keys = (await findActiveServices(db)).map((s) => s.key)
    expect(keys.some((k) => k.includes('ramp'))).toBe(false)
  })
})

describe('setFlightServices quantities + embedded read', () => {
  it('round-trips a quantity through the embed and keeps it when a later save sends the bare key', async () => {
    const flight = await makeFlight(db)
    await setFlightServices(db, flight.id, ['fuel', 'tks_fluid'], { tks_fluid: 12 })
    let row = await readFlight(flight.id)
    expect(serviceKeysFromRow(row)).toEqual(['fuel', 'tks_fluid'])
    expect(serviceQuantitiesFromRow(row)).toEqual({ tks_fluid: 12 })

    await setFlightServices(db, flight.id, ['fuel', 'tks_fluid'])
    expect(serviceQuantitiesFromRow(await readFlight(flight.id))).toEqual({ tks_fluid: 12 })

    await setFlightServices(db, flight.id, ['fuel', 'tks_fluid'], { tks_fluid: 20 })
    expect(serviceQuantitiesFromRow(await readFlight(flight.id))).toEqual({ tks_fluid: 20 })

    await setFlightServices(db, flight.id, ['fuel'])
    row = await readFlight(flight.id)
    expect(serviceQuantitiesFromRow(row)).toEqual({})
  })

  it('rejects quantity 0 and leaves the flight unchanged', async () => {
    const flight = await makeFlight(db)
    await setFlightServices(db, flight.id, ['fuel'])
    await expect(setFlightServices(db, flight.id, ['fuel', 'tks_fluid'], { tks_fluid: 0 })).rejects.toBeTruthy()
    expect(serviceKeysFromRow(await readFlight(flight.id))).toEqual(['fuel'])
  })
})

describe('setFlightServices + embedded read', () => {
  it('writes the junction and dual-writes flight.services; the flight read maps to the key array', async () => {
    const flight = await makeFlight(db)
    const stored = await setFlightServices(db, flight.id, ['lav', 'fuel', 'cleaning', 'fuel'])
    expect(stored).toEqual(['fuel', 'lav', 'cleaning'])

    const row = await readFlight(flight.id)
    expect(serviceKeysFromRow(row)).toEqual(['fuel', 'lav', 'cleaning'])
    expect([...(row.services as unknown as string[])].sort()).toEqual(['cleaning', 'fuel', 'lav'])

    const list = await findAllFlights(db, { includeHidden: true })
    expect(serviceKeysFromRow(list.find((f) => f.id === flight.id) ?? {})).toEqual(['fuel', 'lav', 'cleaning'])
  })

  it('replaces the set, is idempotent and clears with an empty list', async () => {
    const flight = await makeFlight(db)
    await setFlightServices(db, flight.id, ['fuel', 'gpu'])
    await setFlightServices(db, flight.id, ['fuel', 'gpu'])
    expect(await setFlightServices(db, flight.id, ['gpu'])).toEqual(['gpu'])
    expect(serviceKeysFromRow((await readFlight(flight.id)))).toEqual(['gpu'])
    expect(await setFlightServices(db, flight.id, [])).toEqual([])
    const row = await readFlight(flight.id)
    expect(serviceKeysFromRow(row)).toEqual([])
    expect(row.services).toEqual([])
  })

  it('raises on an unknown key and on an inactive key, leaving the flight unchanged', async () => {
    const flight = await makeFlight(db)
    await setFlightServices(db, flight.id, ['fuel'])
    await expect(setFlightServices(db, flight.id, ['fuel', 'nope'])).rejects.toMatchObject({
      message: expect.stringContaining('unknown service key(s): nope'),
    })
    await db.from('service').update({ active: false }).eq('key', 'ice')
    await expect(setFlightServices(db, flight.id, ['fuel', 'ice'])).rejects.toMatchObject({
      message: expect.stringContaining('inactive service key(s): ice'),
    })
    expect(serviceKeysFromRow((await readFlight(flight.id)))).toEqual(['fuel'])
  })

  it('bumps updated_at, and the edit-concurrency check works against the post-RPC value', async () => {
    const flight = await makeFlight(db)
    const loaded = flight.updated_at

    // What the hook does on a normal edit: guarded update, then the RPC, then a re-read.
    await updateFlight(db, flight.id, { notes: 'first edit' }, loaded)
    await setFlightServices(db, flight.id, ['fuel'])
    const after = (await readFlight(flight.id))
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(loaded).getTime())

    // The next edit uses the post-RPC updated_at: no false conflict.
    await expect(updateFlight(db, flight.id, { notes: 'second edit' }, after.updated_at)).resolves.toMatchObject({
      notes: 'second edit',
    })
    // The pre-RPC value is stale, exactly like another user's save.
    await expect(updateFlight(db, flight.id, { notes: 'stale' }, loaded)).rejects.toBeInstanceOf(
      ConcurrencyConflictError
    )
  })
})
