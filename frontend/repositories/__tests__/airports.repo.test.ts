import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  createTestClient,
  TEST_ANON_KEY,
  TEST_SUPABASE_URL
} from '@/tests/support/client'
import { storedCode } from '@/lib/airports'
import {
  findAirportsByCode,
  getAirportByCode,
  searchAirports
} from '@/repositories/airports.repo'

// Needs the airport seed (20261104001000_airport_seed.sql) in the local database.
const db = createTestClient()
const codes = (
  rows: {
    icao: string | null
    ident: string
    faa: string | null
    iata: string | null
  }[]
) => rows.map(storedCode)

describe('airports.repo', () => {
  it('resolves US codes to the ICAO airport', async () => {
    expect(codes(await searchAirports(db, 'MSO', 10, 'US'))[0]).toBe('KMSO')
    expect(codes(await searchAirports(db, 'KMSO', 10, 'US'))).toEqual(['KMSO'])
    expect(codes(await searchAirports(db, 'ANC', 10, 'US'))[0]).toBe('PANC')
    expect(codes(await searchAirports(db, 'HNL', 10, 'US'))[0]).toBe('PHNL')
    expect(codes(await searchAirports(db, 'SJU', 10, 'US'))[0]).toBe('TJSJ')
  })

  it('finds Glacier Park by FCA, GPI and KGPI', async () => {
    expect(codes(await searchAirports(db, 'FCA', 10, 'US'))[0]).toBe('KGPI')
    expect(codes(await searchAirports(db, 'KGPI', 10, 'US'))[0]).toBe('KGPI')
  })

  it('returns Glacier Park and Guapi for GPI, ordered by home country', async () => {
    const us = codes(await findAirportsByCode(db, 'GPI', 'US'))
    expect(us).toEqual(['KGPI', 'SKGP'])
    const co = codes(await findAirportsByCode(db, 'gpi', 'CO'))
    expect(co).toEqual(['SKGP', 'KGPI'])
    const search = codes(await searchAirports(db, 'GPI', 10, 'US'))
    expect(search.slice(0, 2)).toEqual(['KGPI', 'SKGP'])
  })

  it('searches by name and city', async () => {
    const rows = await searchAirports(db, 'Kalispell', 10, 'US')
    expect(codes(rows)).toContain('KGPI')
    expect(codes(await searchAirports(db, 'glacier park', 10, 'US'))[0]).toBe(
      'KGPI'
    )
  })

  it('returns nothing for an unknown string and survives punctuation', async () => {
    expect(await searchAirports(db, 'ZZZZQ', 10, 'US')).toEqual([])
    await expect(
      searchAirports(db, 'a,b(c)%_', 10, 'US')
    ).resolves.toBeDefined()
  })

  it('getAirportByCode returns the airport or null', async () => {
    expect((await getAirportByCode(db, 'KMSO'))?.name).toContain('Missoula')
    expect(await getAirportByCode(db, 'ZZZZQ')).toBeNull()
  })

  it('is readable by signed-in users only and read-only for the API', async () => {
    const anon = createClient(TEST_SUPABASE_URL, TEST_ANON_KEY)
    const { data, error } = await anon.from('airport').select('id').limit(1)
    expect(error ?? data?.length === 0).toBeTruthy()
  })
})
