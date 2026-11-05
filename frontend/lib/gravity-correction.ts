// API gravity -> 60F correction, replicating what a GAMMON Technical Products
// GTP-3012-1A conversion wheel does for a petroleum hydrometer reading.
//
// Software cross-check only: the wheel reading taken in the field is the number
// of record for the load-acceptance decision. Constants are the "generalized
// refined products" K0/K1/K2 set from API MPMS Chapter 11.1:2004, selected by
// API gravity range. Ported unchanged from the Minuteman Dashboard.

const WATER_DENSITY_60F_KGM3 = 999.012

function apiToDensityKgM3(api: number): number {
  return (141.5 / (131.5 + api)) * WATER_DENSITY_60F_KGM3
}

function densityKgM3ToApi(densityKgM3: number): number {
  return (141.5 * WATER_DENSITY_60F_KGM3) / densityKgM3 - 131.5
}

function constantsForApi(api: number): { K0: number; K1: number; K2: number } {
  if (api <= 37.1) return { K0: 103.872, K1: 0.2701, K2: 0 } // Fuel oils
  if (api <= 48.0) return { K0: 330.301, K1: 0, K2: 0 } // Light gas oils (most Jet A)
  if (api <= 52.0) return { K0: 1489.067, K1: 0, K2: -0.0018684 } // Transition zone
  return { K0: 192.4571, K1: 0.2438, K2: 0 } // Very light gas oils
}

function alpha60For(densityKgM3: number): number {
  const { K0, K1, K2 } = constantsForApi(densityKgM3ToApi(densityKgM3))
  return K0 / (densityKgM3 * densityKgM3) + K1 / densityKgM3 + K2
}

function volumeCorrectionFactor(alpha: number, deltaTempF: number): number {
  return Math.exp(-alpha * deltaTempF * (1 + 0.8 * alpha * deltaTempF))
}

/** Observed API gravity at observedTempF -> API gravity at 60F. */
export function correctApiGravityTo60(observedApi: number, observedTempF: number): number {
  const rhoObs = apiToDensityKgM3(observedApi)
  const deltaTempF = observedTempF - 60

  let rho60 = rhoObs
  for (let i = 0; i < 8; i++) {
    const vcf = volumeCorrectionFactor(alpha60For(rho60), deltaTempF)
    const next = rhoObs / vcf
    if (Math.abs(next - rho60) < 0.0001) {
      rho60 = next
      break
    }
    rho60 = next
  }
  return Math.round(densityKgM3ToApi(rho60) * 100) / 100
}

/** API gravity at 60F -> estimated density (lbs/gal) at another temperature. */
export function densityLbsGalAtTemp(api60: number, targetTempF: number): number {
  const rho60 = apiToDensityKgM3(api60)
  const vcf = volumeCorrectionFactor(alpha60For(rho60), targetTempF - 60)
  return Math.round(rho60 * vcf * 0.00834540445 * 1000) / 1000
}

export function apiGravityToSpecificGravity(api: number): number {
  return Math.round((141.5 / (131.5 + api)) * 10000) / 10000
}
