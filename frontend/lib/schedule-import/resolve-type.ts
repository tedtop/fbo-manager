// Printed Type column -> ICAO aircraft type (BACKLOG B45, docs/PLAN.md "B45 Schedule sheet import design").
// The column is front-desk free text ("CJ2", "ENCORE", "KING AIR 350", "G-IVSP"). It is only used when the answer is
// unambiguous in lib/icao-aircraft-types; otherwise the type stays unresolved and the user picks one. Pure.

import { findIcaoType, type IcaoAircraftType, rankAndFilterIcaoTypes } from '@/lib/icao-aircraft-types'

/**
 * The ICAO type the printed text names, or null. Matches (1) an ICAO designator written as is ("C525", "PC-12" ->
 * PC12), else (2) text whose every word is found in exactly ONE table row ("CJ2" -> the table's only CJ2 row). More than
 * one candidate ("BRAVO", "KING AIR", "350") or none ("G-IVSP") is unresolved: a guess here would put a wrong type on
 * the board.
 */
export function matchPrintedType(printed: string): IcaoAircraftType | null {
  const text = printed.trim()
  if (!text) return null
  const code = findIcaoType(text.replace(/[\s-]/g, ''))
  if (code) return code
  const hits = rankAndFilterIcaoTypes(text, {})
  return hits.length === 1 ? hits[0] : null
}
