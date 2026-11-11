import { fetchFaaRegistration, isUsTail, mapFaaToIcao, parseFaaPage } from '@/lib/faa-registry'
import { lookupAircraftType } from '@/lib/aircraft-lookup'
import { describe, expect, it, vi } from 'vitest'

const row = (label: string, value: string) =>
  `<td data-label="">${label}</td><td data-label="${label}">${value}      </td>`

// Trimmed copy of the FAA result page for N33PX.
const N33PX_PAGE = `<table>
${row('Manufacturer Name', 'CESSNA')}${row('Model', '560')}
${row('Mode S Code (Base 16 / Hex)', 'A394D1')}
<td data-label="">Name</td><td data-label="Name" colspan="3">AIRTIME LLC     </td></table>`

const adsbdbMiss = () =>
  new Response(JSON.stringify({ response: 'unknown aircraft' }), { status: 404 })

/** Routes adsbdb and FAA calls to canned responses. */
function bothSources(faa: () => Response | Promise<Response>, adsb = adsbdbMiss) {
  return vi.fn(async (url: string | URL | Request) =>
    String(url).includes('adsbdb') ? adsb() : faa()
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('mapFaaToIcao', () => {
  it.each([
    ['CESSNA', '560', 'C560'],
    ['CESSNA', '560XL', 'C56X'],
    ['CESSNA', '525B', 'C25B'],
    ['CESSNA', 'R172K', 'C172'],
    ['CESSNA', 'T182T', 'C182'],
    ['CESSNA', '208B', 'C208'],
    ['BEECH', 'B200', 'BE20'],
    ['PIPER', 'PA-28R-201', 'P28R'],
    ['PIPER', 'PA-28-181', 'P28A'],
    ['PIPER', 'PA-46-350P', 'PA46'],
    ['CIRRUS DESIGN CORP', 'SR22T', 'SR22'],
    ['PILATUS AIRCRAFT LTD', 'PC-12/47E', 'PC12'],
    ['GULFSTREAM AEROSPACE', 'G-IV', 'GLF4']
  ])('%s %s -> %s', (maker, model, icao) => {
    expect(mapFaaToIcao(maker, model)).toBe(icao)
  })

  it('returns null for models it cannot map', () => {
    expect(mapFaaToIcao('ACME HOMEBUILT', 'ZX-9')).toBeNull()
    expect(mapFaaToIcao('CESSNA', 'CITATION')).toBeNull()
  })
})

describe('isUsTail', () => {
  it('accepts N numbers and rejects other registrations', () => {
    expect(isUsTail('N33PX')).toBe(true)
    expect(isUsTail('N868CB')).toBe(true)
    expect(isUsTail('N0123')).toBe(false)
    expect(isUsTail('C-GABC')).toBe(false)
    expect(isUsTail('G-IVSP')).toBe(false)
  })
})

describe('parseFaaPage', () => {
  it('reads make, model, mode S and owner', () => {
    expect(parseFaaPage(N33PX_PAGE)).toEqual({
      manufacturer: 'CESSNA',
      model: '560',
      modeSHex: 'A394D1',
      owner: 'AIRTIME LLC'
    })
  })

  it('returns null for a page without an aircraft record', () => {
    expect(parseFaaPage('<html>N-Number Inquiry Results</html>')).toBeNull()
  })
})

describe('fetchFaaRegistration', () => {
  it('does not call the FAA for non-US tails', async () => {
    const f = vi.fn() as unknown as typeof fetch
    expect(await fetchFaaRegistration('C-GABC', f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('returns undefined when the FAA is unreachable', async () => {
    const f = vi.fn(async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await fetchFaaRegistration('N33PX', f)).toBeUndefined()
  })
})

describe('lookupAircraftType with the FAA fallback', () => {
  it('resolves N33PX to C560 when adsbdb has no record', async () => {
    const f = bothSources(() => new Response(N33PX_PAGE))
    const result = await lookupAircraftType('n33px', f)
    expect(result).toMatchObject({
      tail: 'N33PX',
      typeIcao: 'C560',
      manufacturer: 'Cessna',
      icao24: 'A394D1',
      photoUrl: null,
      source: 'faa'
    })
    expect(f).toHaveBeenCalledTimes(2)
    expect(String((f as any).mock.calls[1][0])).toContain('nNumberTxt=N33PX')
  })

  it('does not call the FAA when adsbdb answers', async () => {
    const hit = { response: { aircraft: { icao_type: 'C25A', type: 'Citation CJ2' } } }
    const f = bothSources(
      () => new Response(N33PX_PAGE),
      () => new Response(JSON.stringify(hit))
    )
    const result = await lookupAircraftType('N868CB', f)
    expect(result?.source).toBe('adsbdb')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps non-US tails on adsbdb only', async () => {
    const f = bothSources(() => new Response(N33PX_PAGE))
    expect(await lookupAircraftType('C-GABC', f)).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('returns null when the FAA make/model is not in our type list', async () => {
    const page = `${row('Manufacturer Name', 'ACME')}${row('Model', 'ZX-9')}`
    expect(await lookupAircraftType('N12345', bothSources(() => new Response(page)))).toBeNull()
  })

  it('returns null when the FAA call fails', async () => {
    const f = bothSources(() => new Response('nope', { status: 503 }))
    expect(await lookupAircraftType('N33PX', f)).toBeNull()
  })
})
