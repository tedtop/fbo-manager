/**
 * ICAO aircraft type designators (ICAO Doc 8643), curated to what an FBO sees.
 * Not to be confused with lib/aircraft-types.ts (parking-map size table).
 * Reference: https://en.wikipedia.org/wiki/List_of_aircraft_type_designators
 */

export type IcaoEngineType =
  | 'Piston'
  | 'Turboprop'
  | 'Jet'
  | 'Electric'
  | 'Rocket'
  | 'Helicopter'

export type IcaoWakeCategory = 'L' | 'M' | 'H' | 'J'

export interface IcaoAircraftType {
  icao: string
  manufacturer: string
  model: string
  /** ICAO class code, e.g. L2J (landplane, 2 engines, jet), H1T (helicopter, 1 turbine) */
  classCode?: string
  engineType?: IcaoEngineType
  engineCount?: number
  wakeCategory?: IcaoWakeCategory
}

// [icao, manufacturer, model, classCode, wake]
type Row = [string, string, string, string, IcaoWakeCategory]

const ROWS: Row[] = [
  // Gulfstream
  ['GLF2', 'Gulfstream', 'G-II', 'L2J', 'M'],
  ['GLF3', 'Gulfstream', 'G-III', 'L2J', 'M'],
  ['GLF4', 'Gulfstream', 'G-IV / G400', 'L2J', 'M'],
  ['GLF5', 'Gulfstream', 'G-V / G500', 'L2J', 'M'],
  ['GLF6', 'Gulfstream', 'G650', 'L2J', 'M'],
  ['GALX', 'Gulfstream', 'G200 / Galaxy', 'L2J', 'M'],
  ['G150', 'Gulfstream', 'G150', 'L2J', 'M'],
  ['G280', 'Gulfstream', 'G280', 'L2J', 'M'],
  ['GA5C', 'Gulfstream', 'G500', 'L2J', 'M'],
  ['GA6C', 'Gulfstream', 'G600', 'L2J', 'M'],
  ['GA7C', 'Gulfstream', 'G700', 'L2J', 'M'],
  ['ASTR', 'IAI', 'Astra / Gulfstream G100', 'L2J', 'M'],
  ['WW24', 'IAI', 'Westwind', 'L2J', 'M'],
  // Bombardier
  ['CL30', 'Bombardier', 'Challenger 300', 'L2J', 'M'],
  ['CL35', 'Bombardier', 'Challenger 350', 'L2J', 'M'],
  ['CL60', 'Bombardier', 'Challenger 600 series', 'L2J', 'M'],
  ['GLEX', 'Bombardier', 'Global Express', 'L2J', 'M'],
  ['GL5T', 'Bombardier', 'Global 5000', 'L2J', 'M'],
  ['GL6T', 'Bombardier', 'Global 6000', 'L2J', 'M'],
  ['GL7T', 'Bombardier', 'Global 7500', 'L2J', 'M'],
  ['CRJ2', 'Bombardier', 'CRJ-200', 'L2J', 'M'],
  ['CRJ7', 'Bombardier', 'CRJ-700', 'L2J', 'M'],
  ['CRJ9', 'Bombardier', 'CRJ-900', 'L2J', 'M'],
  ['DH8D', 'Bombardier', 'Dash 8 Q400', 'L2T', 'M'],
  ['DHC6', 'De Havilland Canada', 'DHC-6 Twin Otter', 'L2T', 'L'],
  // Learjet
  ['LJ31', 'Learjet', '31', 'L2J', 'L'],
  ['LJ35', 'Learjet', '35', 'L2J', 'M'],
  ['LJ40', 'Learjet', '40', 'L2J', 'M'],
  ['LJ45', 'Learjet', '45', 'L2J', 'M'],
  ['LJ55', 'Learjet', '55', 'L2J', 'M'],
  ['LJ60', 'Learjet', '60', 'L2J', 'M'],
  ['LJ75', 'Learjet', '75', 'L2J', 'M'],
  // Cessna Citation
  ['C500', 'Cessna', 'Citation I', 'L2J', 'L'],
  ['C501', 'Cessna', 'Citation I/SP', 'L2J', 'L'],
  ['C510', 'Cessna', 'Citation Mustang', 'L2J', 'L'],
  ['C525', 'Cessna', 'CitationJet CJ1', 'L2J', 'L'],
  ['C25A', 'Cessna', 'Citation CJ2', 'L2J', 'L'],
  ['C25B', 'Cessna', 'Citation CJ3', 'L2J', 'L'],
  ['C25C', 'Cessna', 'Citation CJ4', 'L2J', 'M'],
  ['C550', 'Cessna', 'Citation II / Bravo', 'L2J', 'M'],
  ['C560', 'Cessna', 'Citation V / Ultra / Encore', 'L2J', 'M'],
  ['C56X', 'Cessna', 'Citation Excel / XLS', 'L2J', 'M'],
  ['C650', 'Cessna', 'Citation III / VI / VII', 'L2J', 'M'],
  ['C680', 'Cessna', 'Citation Sovereign', 'L2J', 'M'],
  ['C68A', 'Cessna', 'Citation Latitude', 'L2J', 'M'],
  ['C700', 'Cessna', 'Citation Longitude', 'L2J', 'M'],
  ['C750', 'Cessna', 'Citation X', 'L2J', 'M'],
  // Embraer
  ['E50P', 'Embraer', 'Phenom 100', 'L2J', 'L'],
  ['E55P', 'Embraer', 'Phenom 300', 'L2J', 'M'],
  ['E545', 'Embraer', 'Legacy 450', 'L2J', 'M'],
  ['E550', 'Embraer', 'Legacy 500', 'L2J', 'M'],
  ['E120', 'Embraer', 'EMB-120 Brasilia', 'L2T', 'M'],
  ['E135', 'Embraer', 'ERJ-135 / Legacy 600', 'L2J', 'M'],
  ['E145', 'Embraer', 'ERJ-145', 'L2J', 'M'],
  ['E170', 'Embraer', 'E170', 'L2J', 'M'],
  ['E175', 'Embraer', 'E175', 'L2J', 'M'],
  ['E190', 'Embraer', 'E190', 'L2J', 'M'],
  ['E195', 'Embraer', 'E195', 'L2J', 'M'],
  // Dassault
  ['FA10', 'Dassault', 'Falcon 10', 'L2J', 'M'],
  ['FA20', 'Dassault', 'Falcon 20', 'L2J', 'M'],
  ['FA50', 'Dassault', 'Falcon 50', 'L3J', 'M'],
  ['FA7X', 'Dassault', 'Falcon 7X', 'L3J', 'M'],
  ['FA8X', 'Dassault', 'Falcon 8X', 'L3J', 'M'],
  ['F900', 'Dassault', 'Falcon 900', 'L3J', 'M'],
  ['F2TH', 'Dassault', 'Falcon 2000', 'L2J', 'M'],
  // Hawker / Beechcraft jets, Honda, Eclipse, Cirrus jet
  ['H25B', 'Hawker', '800 / 125-800', 'L2J', 'M'],
  ['H25C', 'Hawker', '1000', 'L2J', 'M'],
  ['BE40', 'Beechcraft', 'Beechjet 400 / Hawker 400', 'L2J', 'M'],
  ['HA4T', 'Hawker', '4000', 'L2J', 'M'],
  ['PRM1', 'Beechcraft', 'Premier I', 'L2J', 'L'],
  ['HDJT', 'Honda', 'HondaJet', 'L2J', 'L'],
  ['EA50', 'Eclipse', 'Eclipse 500 / 550', 'L2J', 'L'],
  ['SF50', 'Cirrus', 'Vision Jet SF50', 'L1J', 'L'],
  ['PC24', 'Pilatus', 'PC-24', 'L2J', 'M'],
  // Turboprops
  ['PC12', 'Pilatus', 'PC-12', 'L1T', 'L'],
  ['TBM7', 'Daher', 'TBM 700', 'L1T', 'L'],
  ['TBM8', 'Daher', 'TBM 850', 'L1T', 'L'],
  ['TBM9', 'Daher', 'TBM 900 / 940 / 960', 'L1T', 'L'],
  ['KODI', 'Daher', 'Kodiak 100', 'L1T', 'L'],
  ['C208', 'Cessna', '208 Caravan', 'L1T', 'L'],
  ['BE10', 'Beechcraft', 'King Air 100', 'L2T', 'L'],
  ['BE20', 'Beechcraft', 'King Air 200', 'L2T', 'L'],
  ['BE30', 'Beechcraft', 'King Air 300', 'L2T', 'M'],
  ['B350', 'Beechcraft', 'King Air 350', 'L2T', 'L'],
  ['BE9L', 'Beechcraft', 'King Air C90', 'L2T', 'L'],
  ['B190', 'Beechcraft', '1900', 'L2T', 'M'],
  ['C425', 'Cessna', 'Conquest I', 'L2T', 'L'],
  ['C441', 'Cessna', 'Conquest II', 'L2T', 'L'],
  ['MU2', 'Mitsubishi', 'MU-2', 'L2T', 'L'],
  ['P180', 'Piaggio', 'P.180 Avanti', 'L2T', 'L'],
  ['SW4', 'Fairchild', 'Metroliner', 'L2T', 'M'],
  ['SF34', 'Saab', '340', 'L2T', 'M'],
  ['AT72', 'ATR', 'ATR 72', 'L2T', 'M'],
  // Piston singles
  ['C150', 'Cessna', '150', 'L1P', 'L'],
  ['C152', 'Cessna', '152', 'L1P', 'L'],
  ['C172', 'Cessna', '172 Skyhawk', 'L1P', 'L'],
  ['C177', 'Cessna', '177 Cardinal', 'L1P', 'L'],
  ['C182', 'Cessna', '182 Skylane', 'L1P', 'L'],
  ['C206', 'Cessna', '206 Stationair', 'L1P', 'L'],
  ['C210', 'Cessna', '210 Centurion', 'L1P', 'L'],
  ['PA28', 'Piper', 'PA-28 Cherokee', 'L1P', 'L'],
  ['P28A', 'Piper', 'PA-28 Archer', 'L1P', 'L'],
  ['P28R', 'Piper', 'PA-28R Arrow', 'L1P', 'L'],
  ['PA32', 'Piper', 'PA-32 Cherokee Six / Saratoga', 'L1P', 'L'],
  ['PA46', 'Piper', 'PA-46 Malibu / Mirage', 'L1P', 'L'],
  ['P46T', 'Piper', 'PA-46 Meridian / M500', 'L1T', 'L'],
  ['PA18', 'Piper', 'PA-18 Super Cub', 'L1P', 'L'],
  ['SR20', 'Cirrus', 'SR20', 'L1P', 'L'],
  ['SR22', 'Cirrus', 'SR22', 'L1P', 'L'],
  ['DA20', 'Diamond', 'DA20', 'L1P', 'L'],
  ['DA40', 'Diamond', 'DA40 Diamond Star', 'L1P', 'L'],
  ['M20P', 'Mooney', 'M20 (Ovation / Bravo / Eagle)', 'L1P', 'L'],
  ['BE33', 'Beechcraft', 'Debonair / Bonanza 33', 'L1P', 'L'],
  ['BE35', 'Beechcraft', 'Bonanza 35', 'L1P', 'L'],
  ['BE36', 'Beechcraft', 'Bonanza 36', 'L1P', 'L'],
  // Piston twins
  ['BE55', 'Beechcraft', 'Baron 55', 'L2P', 'L'],
  ['BE58', 'Beechcraft', 'Baron 58', 'L2P', 'L'],
  ['BE60', 'Beechcraft', 'Duke', 'L2P', 'L'],
  ['BE99', 'Beechcraft', 'Airliner 99', 'L2T', 'L'],
  ['C310', 'Cessna', '310', 'L2P', 'L'],
  ['C340', 'Cessna', '340', 'L2P', 'L'],
  ['C402', 'Cessna', '402', 'L2P', 'L'],
  ['C414', 'Cessna', '414 Chancellor', 'L2P', 'L'],
  ['C421', 'Cessna', '421 Golden Eagle', 'L2P', 'L'],
  ['PA31', 'Piper', 'PA-31 Navajo', 'L2P', 'L'],
  ['PA34', 'Piper', 'PA-34 Seneca', 'L2P', 'L'],
  ['PA44', 'Piper', 'PA-44 Seminole', 'L2P', 'L'],
  ['DA42', 'Diamond', 'DA42 Twin Star', 'L2P', 'L'],
  ['DC3', 'Douglas', 'DC-3', 'L2P', 'M'],
  // Helicopters
  ['R22', 'Robinson', 'R22', 'H1P', 'L'],
  ['R44', 'Robinson', 'R44', 'H1P', 'L'],
  ['R66', 'Robinson', 'R66', 'H1T', 'L'],
  ['B06', 'Bell', '206 JetRanger', 'H1T', 'L'],
  ['B407', 'Bell', '407', 'H1T', 'L'],
  ['B212', 'Bell', '212', 'H2T', 'M'],
  ['B412', 'Bell', '412', 'H2T', 'M'],
  ['B429', 'Bell', '429', 'H2T', 'L'],
  ['AS50', 'Airbus Helicopters', 'AS350 / H125', 'H1T', 'L'],
  ['EC30', 'Airbus Helicopters', 'EC130 / H130', 'H1T', 'L'],
  ['EC35', 'Airbus Helicopters', 'EC135 / H135', 'H2T', 'L'],
  ['EC45', 'Airbus Helicopters', 'EC145 / H145', 'H2T', 'L'],
  ['A109', 'Leonardo', 'AW109', 'H2T', 'L'],
  ['A139', 'Leonardo', 'AW139', 'H2T', 'M'],
  ['S76', 'Sikorsky', 'S-76', 'H2T', 'M'],
  ['S92', 'Sikorsky', 'S-92', 'H2T', 'M'],
  // Airliners / transports
  ['A318', 'Airbus', 'A318', 'L2J', 'M'],
  ['A319', 'Airbus', 'A319', 'L2J', 'M'],
  ['A320', 'Airbus', 'A320', 'L2J', 'M'],
  ['A321', 'Airbus', 'A321', 'L2J', 'M'],
  ['A20N', 'Airbus', 'A320neo', 'L2J', 'M'],
  ['A21N', 'Airbus', 'A321neo', 'L2J', 'M'],
  ['A332', 'Airbus', 'A330-200', 'L2J', 'H'],
  ['A333', 'Airbus', 'A330-300', 'L2J', 'H'],
  ['A359', 'Airbus', 'A350-900', 'L2J', 'H'],
  ['A388', 'Airbus', 'A380-800', 'L4J', 'J'],
  ['B733', 'Boeing', '737-300', 'L2J', 'M'],
  ['B734', 'Boeing', '737-400', 'L2J', 'M'],
  ['B737', 'Boeing', '737-700', 'L2J', 'M'],
  ['B738', 'Boeing', '737-800', 'L2J', 'M'],
  ['B739', 'Boeing', '737-900', 'L2J', 'M'],
  ['B38M', 'Boeing', '737 MAX 8', 'L2J', 'M'],
  ['B39M', 'Boeing', '737 MAX 9', 'L2J', 'M'],
  ['B744', 'Boeing', '747-400', 'L4J', 'H'],
  ['B748', 'Boeing', '747-8', 'L4J', 'H'],
  ['B752', 'Boeing', '757-200', 'L2J', 'M'],
  ['B753', 'Boeing', '757-300', 'L2J', 'M'],
  ['B762', 'Boeing', '767-200', 'L2J', 'H'],
  ['B763', 'Boeing', '767-300', 'L2J', 'H'],
  ['B772', 'Boeing', '777-200', 'L2J', 'H'],
  ['B77W', 'Boeing', '777-300ER', 'L2J', 'H'],
  ['B788', 'Boeing', '787-8', 'L2J', 'H'],
  ['B789', 'Boeing', '787-9', 'L2J', 'H'],
  ['MD82', 'McDonnell Douglas', 'MD-82', 'L2J', 'M'],
  ['MD88', 'McDonnell Douglas', 'MD-88', 'L2J', 'M'],
  ['MD11', 'McDonnell Douglas', 'MD-11', 'L3J', 'H'],
  ['C130', 'Lockheed', 'C-130 Hercules', 'L4T', 'M']
]

const ENGINE_BY_CHAR: Record<string, IcaoEngineType> = {
  P: 'Piston',
  T: 'Turboprop',
  J: 'Jet',
  E: 'Electric',
  R: 'Rocket'
}

export const ICAO_AIRCRAFT_TYPES: IcaoAircraftType[] = ROWS.map(
  ([icao, manufacturer, model, classCode, wakeCategory]) => ({
    icao,
    manufacturer,
    model,
    classCode,
    engineType:
      classCode[0] === 'H' ? 'Helicopter' : ENGINE_BY_CHAR[classCode[2]],
    engineCount: Number(classCode[1]),
    wakeCategory
  })
)

/** Most common FBO types, in display order (after types already used in our data). */
export const COMMON_ICAO_CODES: string[] = [
  'C172',
  'SR22',
  'PC12',
  'BE20',
  'TBM9',
  'C182',
  'PA46',
  'BE58',
  'C510',
  'C525',
  'C25A',
  'C25B',
  'C25C',
  'C56X',
  'C680',
  'C750',
  'CL30',
  'CL35',
  'CL60',
  'GLEX',
  'GLF4',
  'GLF5',
  'GLF6',
  'GL5T',
  'GL7T',
  'FA7X',
  'F900',
  'F2TH',
  'E55P',
  'E50P',
  'LJ45',
  'LJ60',
  'H25B',
  'B350',
  'BE9L',
  'PC24',
  'SF50',
  'HDJT',
  'B738',
  'B737',
  'A320',
  'A319',
  'A321',
  'CRJ9',
  'E170',
  'E175',
  'B752'
]

const BY_ICAO = new Map(ICAO_AIRCRAFT_TYPES.map((t) => [t.icao, t]))
const COMMON_INDEX = new Map(COMMON_ICAO_CODES.map((c, i) => [c, i]))

export function findIcaoType(icao: string): IcaoAircraftType | undefined {
  return BY_ICAO.get(icao.trim().toUpperCase())
}

export function formatIcaoType(t: IcaoAircraftType): string {
  return `${t.manufacturer} ${t.model}`
}

/**
 * Filter (case-insensitive, every query word must appear in code/manufacturer/model)
 * and rank: types used in our data (most used first), then the common FBO list,
 * then alphabetical by manufacturer/model. Empty query returns the full ranked list.
 */
export function rankAndFilterIcaoTypes(
  query: string,
  usageCounts: Record<string, number>
): IcaoAircraftType[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = ICAO_AIRCRAFT_TYPES.filter((t) => {
    const haystack = `${t.icao} ${t.manufacturer} ${t.model}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
  const used = (t: IcaoAircraftType) => usageCounts[t.icao] ?? 0
  const common = (t: IcaoAircraftType) =>
    COMMON_INDEX.get(t.icao) ?? Number.POSITIVE_INFINITY
  return matches.sort((a, b) => {
    const ua = used(a)
    const ub = used(b)
    if (ua > 0 !== ub > 0) return ua > 0 ? -1 : 1
    if (ua !== ub) return ub - ua
    const ca = common(a)
    const cb = common(b)
    if (ca !== cb) return ca - cb
    return formatIcaoType(a).localeCompare(formatIcaoType(b))
  })
}
