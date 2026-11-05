import { lookupAircraftType, normalizeTail } from '@/lib/aircraft-lookup'
import { describe, expect, it, vi } from 'vitest'

const HIT = {
  response: {
    aircraft: {
      type: 'Citation CJ2',
      icao_type: 'C25A',
      manufacturer: 'Cessna',
      mode_s: 'ABECC3',
      registration: 'N868CB',
      registered_owner: 'Secret Holdings LLC',
      registered_owner_country_iso_name: 'US',
      registered_owner_country_name: 'United States',
      url_photo: 'https://image.airport-data.com/aircraft/N868CB.jpg',
      url_photo_thumbnail: 'https://image.airport-data.com/aircraft/thumbnails/N868CB.jpg'
    }
  }
}

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('normalizeTail', () => {
  it('trims and uppercases', () => {
    expect(normalizeTail('  n868cb ')).toBe('N868CB')
  })
})

describe('lookupAircraftType', () => {
  it('maps a registry hit', async () => {
    const fetchImpl = jsonFetch(HIT)
    const result = await lookupAircraftType('N868CB', fetchImpl)
    expect(result).toEqual({
      tail: 'N868CB',
      icao24: 'ABECC3',
      typeIcao: 'C25A',
      typeDescription: 'Citation CJ2',
      manufacturer: 'Cessna',
      owner: 'Secret Holdings LLC',
      ownerCountry: 'United States',
      photoUrl: 'https://image.airport-data.com/aircraft/N868CB.jpg',
      photoThumbUrl: 'https://image.airport-data.com/aircraft/thumbnails/N868CB.jpg',
      source: 'adsbdb'
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl as any).mock.calls[0][0]).toBe(
      'https://api.adsbdb.com/v0/aircraft/N868CB'
    )
  })

  it('returns the owner and country', async () => {
    const result = await lookupAircraftType('N868CB', jsonFetch(HIT))
    expect(result?.owner).toBe('Secret Holdings LLC')
    expect(result?.ownerCountry).toBe('United States')
  })

  it('returns the photo URLs when present', async () => {
    const result = await lookupAircraftType('N868CB', jsonFetch(HIT))
    expect(result?.photoUrl).toBe('https://image.airport-data.com/aircraft/N868CB.jpg')
    expect(result?.photoThumbUrl).toBe(
      'https://image.airport-data.com/aircraft/thumbnails/N868CB.jpg'
    )
  })

  it('returns null photos when the photo fields are null', async () => {
    const body = {
      response: {
        aircraft: { ...HIT.response.aircraft, url_photo: null, url_photo_thumbnail: null }
      }
    }
    const result = await lookupAircraftType('N868CB', jsonFetch(body))
    expect(result?.photoUrl).toBeNull()
    expect(result?.photoThumbUrl).toBeNull()
  })

  it('drops non-https photo URLs', async () => {
    const body = {
      response: {
        aircraft: {
          ...HIT.response.aircraft,
          url_photo: 'http://image.airport-data.com/a.jpg',
          url_photo_thumbnail: 'javascript:alert(1)'
        }
      }
    }
    const result = await lookupAircraftType('N868CB', jsonFetch(body))
    expect(result?.photoUrl).toBeNull()
    expect(result?.photoThumbUrl).toBeNull()
  })

  it('returns null owner fields when the owner is absent', async () => {
    const { registered_owner, registered_owner_country_name, ...rest } =
      HIT.response.aircraft
    const result = await lookupAircraftType(
      'N868CB',
      jsonFetch({ response: { aircraft: rest } })
    )
    expect(result?.typeIcao).toBe('C25A')
    expect(result?.owner).toBeNull()
    expect(result?.ownerCountry).toBeNull()
  })

  it('normalises the tail before requesting', async () => {
    const fetchImpl = jsonFetch(HIT)
    const result = await lookupAircraftType('  n868cb ', fetchImpl)
    expect(result?.tail).toBe('N868CB')
    expect((fetchImpl as any).mock.calls[0][0]).toMatch(/\/N868CB$/)
  })

  it('returns null for "unknown aircraft"', async () => {
    const result = await lookupAircraftType(
      'N33PX',
      jsonFetch({ response: 'unknown aircraft' })
    )
    expect(result).toBeNull()
  })

  it('returns null when icao_type is empty', async () => {
    const body = { response: { aircraft: { ...HIT.response.aircraft, icao_type: '' } } }
    expect(await lookupAircraftType('N868CB', jsonFetch(body))).toBeNull()
  })

  it('returns null on a non-200 response', async () => {
    expect(await lookupAircraftType('N868CB', jsonFetch(HIT, 500))).toBeNull()
  })

  it('returns null on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await lookupAircraftType('N868CB', fetchImpl)).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    expect(await lookupAircraftType('N868CB', fetchImpl)).toBeNull()
  })

  it('returns null for an empty tail without fetching', async () => {
    const fetchImpl = jsonFetch(HIT)
    expect(await lookupAircraftType('   ', fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
