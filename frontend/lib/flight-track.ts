// Live ADS-B overlay for QT dispatches, ported from Minuteman's api/flight_track.js. Purely an
// enrichment on top of QT's own times: any failure degrades to "nothing tracked" and the card falls
// back to QT's ArrivalDate. Most inbound flights are not within ADS-B range of KMSO, so an absent
// entry is the normal case.
//
// Minuteman keeps its point cache and the tail -> equipment table in Supabase because serverless
// invocations are cold on almost every request. Railway runs one long-lived Node process, so both
// live in memory here (same reasoning as the QT cookie in qt-session.ts) and need no migration.

import { normalizeTail, type FlightTrack } from '@/lib/dispatch-display'

// KMSO reference point. adsb.lol's point query returns every tracked aircraft within the radius with
// `dst` (nm from this point) already computed. 250 nm is the API's maximum.
const KMSO_LAT = 46.9158
const KMSO_LON = -114.0911
const ADSB_RADIUS_NM = 250
const ADSB_POINT_URL = `https://api.adsb.lol/v2/point/${KMSO_LAT}/${KMSO_LON}/${ADSB_RADIUS_NM}`

// adsb.lol is free, keyless and has no SLA: one shared area query per 60 s window, filtered per
// tail locally, rather than one request per tail or per client.
const CACHE_TTL_MS = 60_000

// An ETA from distance / ground speed is meaningless for a parked or taxiing aircraft, so below
// this speed there is no estimate and the card falls back to QT's own ArrivalDate.
const MIN_ETA_GROUND_SPEED_KT = 5

interface AdsbAircraft {
  r?: string // registration
  t?: string // ICAO type code, e.g. "B39M"
  dst?: number
  gs?: number
  alt_baro?: number | 'ground'
}

let pointCache: { aircraft: AdsbAircraft[]; fetchedAt: number } | null = null
let pending: Promise<{ aircraft: AdsbAircraft[]; fetchedAt: number; stale: boolean } | null> | null = null

// An airframe's type is effectively permanent, so every registration + type pair ever seen is kept
// for the life of the process. That lets a tail that is parked at KMSO (no local feeder) or out of
// range still show its real equipment instead of QT's generic one.
const equipmentByTail = new Map<string, string>()

async function fetchPoint(): Promise<AdsbAircraft[]> {
  const response = await fetch(ADSB_POINT_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(`adsb.lol responded ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data?.ac)) throw new Error('adsb.lol response missing ac array')
  return data.ac
}

async function getPointData() {
  if (pointCache && Date.now() - pointCache.fetchedAt < CACHE_TTL_MS) {
    return { ...pointCache, stale: false }
  }
  pending ??= fetchPoint()
    .then((aircraft) => {
      pointCache = { aircraft, fetchedAt: Date.now() }
      for (const ac of aircraft) {
        if (typeof ac.r === 'string' && typeof ac.t === 'string') equipmentByTail.set(normalizeTail(ac.r), ac.t)
      }
      return { ...pointCache, stale: false }
    })
    .catch((error) => {
      console.error('ADS-B fetch failed:', error instanceof Error ? error.message : error)
      return pointCache ? { ...pointCache, stale: true } : null
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function summarizeAircraft(ac: AdsbAircraft): FlightTrack {
  const distanceNm = typeof ac.dst === 'number' ? ac.dst : null
  const groundSpeedKt = typeof ac.gs === 'number' ? ac.gs : null
  // alt_baro is the literal string "ground" when the aircraft is on the ground.
  const onGround = ac.alt_baro === 'ground'
  const altitudeFt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null
  const etaMinutes =
    distanceNm != null && groundSpeedKt != null && groundSpeedKt > MIN_ETA_GROUND_SPEED_KT
      ? (distanceNm / groundSpeedKt) * 60
      : null
  // The transponder's type is the specific variant (B39M) vs QT's generic one ("737"): fuel burn
  // differs a lot within a family.
  const equipmentCode = typeof ac.t === 'string' ? ac.t : null
  return { distanceNm, groundSpeedKt, altitudeFt, onGround, etaMinutes, equipmentCode }
}

export async function trackTails(tails: string[]): Promise<{
  tracked: Record<string, FlightTrack>
  fetchedAt: string | null
  stale: boolean
}> {
  const wanted = new Set(tails.map(normalizeTail).filter(Boolean))
  if (wanted.size === 0) return { tracked: {}, fetchedAt: null, stale: false }

  const point = await getPointData()
  const tracked: Record<string, FlightTrack> = {}
  if (point) {
    for (const ac of point.aircraft) {
      const tail = normalizeTail(ac.r)
      if (wanted.has(tail)) tracked[tail] = summarizeAircraft(ac)
    }
  }

  // Tails with no live position still get their last-known equipment type: no position, speed or
  // ETA, so the card skips the live countdown and just shows the type.
  for (const tail of wanted) {
    const equipmentCode = equipmentByTail.get(tail)
    if (!tracked[tail] && equipmentCode) {
      tracked[tail] = {
        distanceNm: null,
        groundSpeedKt: null,
        altitudeFt: null,
        onGround: null,
        etaMinutes: null,
        equipmentCode
      }
    }
  }

  return { tracked, fetchedAt: point ? new Date(point.fetchedAt).toISOString() : null, stale: point?.stale ?? false }
}
