import {
  type AirportLike,
  normalizeAirportQuery,
  rankAirports
} from '@/lib/airports'
import type { Database, Tables } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AirportRow = Tables<'airport'>

// PostgREST .or() filters are comma/paren separated and ilike uses % and _: drop them from typed text.
const unsafe = /[,()%*_\\"]/g
const cleanText = (raw: string) => raw.replace(unsafe, ' ').trim()

/** Every airport whose ICAO, IATA, FAA identifier or ident equals `code` (indexed lookup). */
export async function findAirportsByCode(
  db: SupabaseClient<Database>,
  code: string,
  homeCountry?: string
): Promise<AirportRow[]> {
  const q = normalizeAirportQuery(code).replace(unsafe, '')
  if (!q) return []
  const { data, error } = await db
    .from('airport')
    .select('*')
    .or(`icao.eq.${q},iata.eq.${q},faa.eq.${q},ident.eq.${q}`)
    .limit(20)
  if (error) throw error
  return rankAirports((data ?? []) as AirportRow[], q, { homeCountry })
}

/**
 * The best exact code match, or null. Stored values are ICAO codes, which are unambiguous; for a typed
 * IATA/FAA code that matches several airports use findAirportsByCode and let the person choose.
 */
export async function getAirportByCode(
  db: SupabaseClient<Database>,
  code: string,
  homeCountry?: string
): Promise<AirportRow | null> {
  const matches = await findAirportsByCode(db, code, homeCountry)
  return matches[0] ?? null
}

/**
 * Airports for the picker: exact code matches (all of them, never collapsed), then code prefixes and
 * name/city matches, ranked by lib/airports (home country first among equals).
 */
export async function searchAirports(
  db: SupabaseClient<Database>,
  query: string,
  limit = 20,
  homeCountry?: string
): Promise<AirportRow[]> {
  const q = normalizeAirportQuery(query)
  if (!q) return []
  const exact = await findAirportsByCode(db, q, homeCountry)
  const text = cleanText(query)
  let broad: AirportRow[] = []
  if (text.length >= 2) {
    const upper = text.toUpperCase()
    const { data, error } = await db
      .from('airport')
      .select('*')
      .or(
        `icao.ilike.${upper}%,iata.ilike.${upper}%,faa.ilike.${upper}%,name.ilike.%${text}%,city.ilike.%${text}%`
      )
      .order('scheduled_service', { ascending: false, nullsFirst: false })
      .order('name')
      .limit(Math.max(limit * 3, 60))
    if (error) throw error
    broad = (data ?? []) as AirportRow[]
  }
  const seen = new Set(exact.map((a) => a.id))
  const merged: AirportLike[] = [
    ...exact,
    ...broad.filter((a) => !seen.has(a.id))
  ]
  return rankAirports(merged as AirportRow[], q, { homeCountry }).slice(
    0,
    limit
  )
}
