/**
 * Aircraft size categories for map display
 * Based on approximate wingspan/length for visual representation
 */

export type AircraftSizeCategory = 'small' | 'medium' | 'large' | 'jumbo'

export interface AircraftSize {
  category: AircraftSizeCategory
  iconSize: number // in pixels
  displayScale: number // multiplier for map scale
}

// Aircraft type (ICAO code) to size category mapping
// Based on common aircraft types seen at FBOs
const AIRCRAFT_TYPE_SIZES: Record<string, AircraftSizeCategory> = {
  // Small Single-Engine (Cessna 172, Piper, etc.)
  C172: 'small',
  C182: 'small',
  C206: 'small',
  PA28: 'small',
  PA32: 'small',
  PA46: 'small',
  SR20: 'small',
  SR22: 'small',

  // Medium Twin-Engine / Light Jets
  C340: 'medium',
  C414: 'medium',
  C421: 'medium',
  BE20: 'medium', // King Air
  BE30: 'medium',
  BE58: 'medium', // Baron
  PC12: 'medium', // Pilatus PC-12
  TBM7: 'medium', // TBM 700/850/900
  TBM9: 'medium',
  C25A: 'medium', // Citation CJ2
  C25B: 'medium', // Citation CJ3
  C25C: 'medium', // Citation CJ4
  C510: 'medium', // Citation Mustang
  C525: 'medium', // CitationJet
  C560: 'medium', // Citation V
  E50P: 'medium', // Phenom 100
  E55P: 'medium', // Phenom 300
  GLF4: 'medium', // Gulfstream IV

  // Large Business Jets / Regional Jets
  C680: 'large', // Citation Sovereign
  C750: 'large', // Citation X
  CL30: 'large', // Challenger 300
  CL35: 'large', // Challenger 350
  CL60: 'large', // Challenger 600
  FA50: 'large', // Falcon 50
  FA7X: 'large', // Falcon 7X
  GLF5: 'large', // Gulfstream V
  GLF6: 'large', // Gulfstream 650
  GLEX: 'large', // Global Express

  // Commercial / Large Aircraft
  B737: 'jumbo', // Boeing 737
  B738: 'jumbo', // Boeing 737-800
  B739: 'jumbo', // Boeing 737-900
  B752: 'jumbo', // Boeing 757-200
  A319: 'jumbo', // Airbus A319
  A320: 'jumbo', // Airbus A320
  A321: 'jumbo', // Airbus A321
  CRJ2: 'large', // CRJ-200
  CRJ7: 'large', // CRJ-700
  CRJ9: 'large', // CRJ-900
  E170: 'large', // Embraer 170
  E175: 'large', // Embraer 175
  E190: 'large', // Embraer 190
}

// Size category to display properties
const SIZE_PROPERTIES: Record<AircraftSizeCategory, AircraftSize> = {
  small: {
    category: 'small',
    iconSize: 24,
    displayScale: 0.8,
  },
  medium: {
    category: 'medium',
    iconSize: 32,
    displayScale: 1.0,
  },
  large: {
    category: 'large',
    iconSize: 40,
    displayScale: 1.3,
  },
  jumbo: {
    category: 'jumbo',
    iconSize: 48,
    displayScale: 1.6,
  },
}

/**
 * Get aircraft size information based on ICAO type code
 * Defaults to 'medium' if type not found
 */
export function getAircraftSize(icaoType?: string): AircraftSize {
  if (!icaoType) {
    return SIZE_PROPERTIES.medium
  }

  const category = AIRCRAFT_TYPE_SIZES[icaoType.toUpperCase()] || 'medium'
  return SIZE_PROPERTIES[category]
}

/**
 * Get size category from aircraft type string
 * Handles various formats and defaults to medium
 */
export function getAircraftSizeCategory(
  aircraftType?: string
): AircraftSizeCategory {
  if (!aircraftType) return 'medium'

  const upperType = aircraftType.toUpperCase()
  return AIRCRAFT_TYPE_SIZES[upperType] || 'medium'
}

/**
 * Helper to get just the icon size in pixels
 */
export function getAircraftIconSize(icaoType?: string): number {
  return getAircraftSize(icaoType).iconSize
}
