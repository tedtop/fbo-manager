import { ICAO_AIRCRAFT_TYPES, findIcaoType } from '@/lib/icao-aircraft-types'

/**
 * Second source for the tail-number type lookup (B86, D17): the FAA aircraft
 * registry, official per-N-number inquiry page (public, free, no key). Only
 * used for US tails when adsbdb has no answer. Make/model are FAA strings
 * ("CESSNA" / "560"); they are mapped to an ICAO designator from our own table
 * or dropped. The owner is display only: never log it or persist it.
 */
export interface FaaRegistration {
  manufacturer: string
  model: string
  modeSHex: string | null
  owner: string | null
}

const FAA_URL = 'https://registry.faa.gov/AircraftInquiry/Search/NNumberResult'
const TIMEOUT_MS = 6000

/** US tails: N, a digit 1-9, then up to 4 more digits/letters (letters are never I or O). */
export function isUsTail(tail: string): boolean {
  return /^N[1-9][0-9A-HJ-NP-Z]{0,4}$/.test(tail)
}

function cell(html: string, label: string): string | null {
  const re = new RegExp(`<td data-label="${label}"[^>]*>([^<]*)</td>`, 'i')
  const value = re.exec(html)?.[1]?.replace(/&amp;/g, '&').trim()
  return value || null
}

/** Parses the FAA N-number result page. Null when the page holds no registration. */
export function parseFaaPage(html: string): FaaRegistration | null {
  const manufacturer = cell(html, 'Manufacturer Name')
  const model = cell(html, 'Model')
  if (!manufacturer || !model) return null
  return {
    manufacturer,
    model,
    modeSHex: cell(html, 'Mode S Code \\(Base 16 / Hex\\)'),
    owner: cell(html, 'Name')
  }
}

export async function fetchFaaRegistration(
  tail: string,
  fetchImpl: typeof fetch = fetch
): Promise<FaaRegistration | null | undefined> {
  // undefined = the FAA could not be reached (do not cache the miss); null = answered, no usable record
  if (!isUsTail(tail)) return null
  try {
    const res = await fetchImpl(`${FAA_URL}?nNumberTxt=${encodeURIComponent(tail)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'text/html', 'user-agent': 'fbo-manager tail lookup' }
    })
    if (!res.ok) return undefined
    return parseFaaPage(await res.text())
  } catch {
    return undefined
  }
}

// FAA model (spaces and hyphens removed, uppercase) -> ICAO, per manufacturer family.
// Only designators present in lib/icao-aircraft-types.ts are returned.
const CESSNA: Record<string, string> = {
  '525': 'C525', '525A': 'C25A', '525B': 'C25B', '525C': 'C25C',
  '560': 'C560', '560XL': 'C56X', '560XLS': 'C56X', '650': 'C650',
  '680': 'C680', '680A': 'C68A', '700': 'C700', '750': 'C750',
  '500': 'C500', '501': 'C501', '510': 'C510', '550': 'C550', '551': 'C550',
  '208': 'C208', '208B': 'C208', '120': 'C120', '140': 'C140'
}
const BEECH: Record<string, string> = {
  '200': 'BE20', 'B200': 'BE20', 'B200GT': 'BE20', '300': 'BE30', 'B300': 'BE30',
  '350': 'B350', 'B300C': 'B350', 'C90': 'BE9L', 'C90A': 'BE9L', 'C90B': 'BE9L',
  'C90GT': 'BE9L', 'C90GTI': 'BE9L', '1900': 'B190', '1900C': 'B190', '1900D': 'B190',
  '58': 'BE58', '55': 'BE55', '60': 'BE60', '99': 'BE99', '390': 'PRM1',
  '400': 'BE40', '400A': 'BE40', '400T': 'BE40'
}
const GULFSTREAM: Record<string, string> = {
  'GII': 'GLF2', 'GIII': 'GLF3', 'GIV': 'GLF4', 'GIVX': 'GLF4', 'G400': 'GLF4',
  'G450': 'GLF4', 'GV': 'GLF5', 'GVSP': 'GLF5', 'G500': 'GLF5', 'G550': 'GLF5',
  'G650': 'GLF6', 'G650ER': 'GLF6', 'G200': 'GALX', 'GALAXY': 'GALX', 'G150': 'G150',
  'G280': 'G280'
}

function mapCessna(model: string): string | null {
  const direct = CESSNA[model]
  if (direct) return direct
  // Piston singles/twins and 17x-21x style names: 172S, R172K, T182T, P210N, 421C
  const m = /^[A-Z]?(\d{3})[A-Z0-9]*$/.exec(model)
  return m ? `C${m[1]}` : null
}

function mapPiper(model: string): string | null {
  const m = /^PA(\d{2})(R|T)?/.exec(model)
  if (!m) return null
  const [, num, suffix] = m
  if (num === '28') {
    if (suffix === 'R') return 'P28R'
    return /^PA28(180|181|236)/.test(model) ? 'P28A' : 'PA28'
  }
  if (num === '46') return /500TP|600|M500|M600/.test(model) ? 'P46T' : 'PA46'
  return { '18': 'PA18', '31': 'PA31', '32': 'PA32', '34': 'PA34', '44': 'PA44' }[num] ?? null
}

function mapOther(maker: string, model: string): string | null {
  if (maker.startsWith('CIRRUS')) {
    if (model.startsWith('SR22')) return 'SR22'
    if (model.startsWith('SR20')) return 'SR20'
    if (model.startsWith('SF50')) return 'SF50'
  }
  if (maker.startsWith('PILATUS')) {
    if (model.startsWith('PC12')) return 'PC12'
    if (model.startsWith('PC24')) return 'PC24'
  }
  if (maker.startsWith('DAHER') || maker.startsWith('SOCATA') || maker.startsWith('TBM')) {
    if (model.startsWith('TBM700')) return 'TBM7'
    if (model.startsWith('TBM850')) return 'TBM8'
    if (/^TBM9[0-9]{2}/.test(model)) return 'TBM9'
  }
  if (maker.startsWith('MOONEY') && model.startsWith('M20')) return 'M20P'
  if (maker.startsWith('DIAMOND')) {
    const m = /^DA(20|40|42)/.exec(model)
    if (m) return `DA${m[1]}`
  }
  if (maker.startsWith('ROBINSON')) {
    const m = /^R(22|44|66)/.exec(model)
    if (m) return `R${m[1]}`
  }
  if (maker.startsWith('EMBRAER')) {
    if (model === 'EMB500' || model === 'EMB500E') return 'E50P'
    if (model === 'EMB505') return 'E55P'
  }
  if (maker.startsWith('HONDA') && model.startsWith('HA420')) return 'HDJT'
  if (maker.startsWith('LEARJET') || maker.startsWith('GATES LEARJET')) {
    const m = /^(31|35|40|45|55|60|75)/.exec(model)
    if (m) return `LJ${m[1]}`
  }
  if (maker.startsWith('DASSAULT')) {
    if (/^FALCON?2000/.test(model) || model.startsWith('2000')) return 'F2TH'
    if (/900/.test(model)) return 'F900'
    if (/7X/.test(model)) return 'FA7X'
  }
  return null
}

/**
 * Maps an FAA manufacturer/model pair to an ICAO type designator in our table,
 * or null when it cannot be mapped with confidence.
 */
export function mapFaaToIcao(manufacturer: string, rawModel: string): string | null {
  const maker = manufacturer.trim().toUpperCase()
  const model = rawModel.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!maker || !model) return null

  let icao: string | null = null
  if (maker.startsWith('CESSNA') || maker.startsWith('TEXTRON')) icao = mapCessna(model)
  else if (maker.includes('BEECH') || maker.startsWith('RAYTHEON')) icao = BEECH[model] ?? null
  else if (maker.startsWith('GULFSTREAM')) icao = GULFSTREAM[model] ?? null
  else if (maker.startsWith('PIPER')) icao = mapPiper(model)
  if (!icao) icao = mapOther(maker, model)
  if (!icao && ICAO_AIRCRAFT_TYPES.some((t) => t.icao === model)) icao = model
  return icao && findIcaoType(icao) ? icao : null
}
