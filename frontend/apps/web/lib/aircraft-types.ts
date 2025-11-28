export interface AircraftTypeDefinition {
  id: string
  name: string
  wingspan: number // in feet
  length: number // in feet
  description: string
}

// Dimensions in Feet (Visual Size ~2.2x real size for map visibility)
export const AIRCRAFT_TYPES: AircraftTypeDefinition[] = [
  {
    id: 'light_single',
    name: 'Light Single-Engine',
    wingspan: 79, // Real: ~36 ft
    length: 62, // Real: ~28 ft
    description: 'Cessna 172, Piper Cherokee'
  },
  {
    id: 'light_twin',
    name: 'Light Twin-Engine',
    wingspan: 84, // Real: ~38 ft
    length: 68, // Real: ~31 ft
    description: 'Cessna 310, Beechcraft Baron'
  },
  {
    id: 'turboprop',
    name: 'Turboprop',
    wingspan: 123, // Real: ~56 ft
    length: 110, // Real: ~50 ft
    description: 'King Air 350, Pilatus PC-12'
  },
  {
    id: 'light_jet',
    name: 'Light Jet',
    wingspan: 114, // Real: ~52 ft
    length: 114, // Real: ~52 ft
    description: 'Citation CJ3, Phenom 300'
  },
  {
    id: 'mid_size_jet',
    name: 'Mid-Size Jet',
    wingspan: 132, // Real: ~60 ft
    length: 152, // Real: ~69 ft
    description: 'Citation X, Learjet 60'
  },
  {
    id: 'regional_jet',
    name: 'Regional Jet',
    wingspan: 180, // Real: ~82 ft
    length: 231, // Real: ~105 ft
    description: 'CRJ-700, Embraer E175'
  },
  {
    id: 'narrow_body',
    name: 'Narrow-Body Airliner',
    wingspan: 280, // Real: ~117 ft
    length: 300, // Real: ~129 ft
    description: 'Boeing 737, Airbus A320'
  },
  {
    id: 'ultra_long_range',
    name: 'Ultra-Long Range Jet',
    wingspan: 310, // Real: ~99 ft -> Scaled up
    length: 320, // Real: ~99 ft -> Scaled up
    description: 'Gulfstream G650, Global 7500'
  }
]

export const DEFAULT_AIRCRAFT_TYPE = 'light_single'

export function getAircraftDefinition(id: string): AircraftTypeDefinition {
  return AIRCRAFT_TYPES.find(t => t.id === id) || AIRCRAFT_TYPES[0]
}
