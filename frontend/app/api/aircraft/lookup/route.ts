import { lookupAircraftType, normalizeTail } from '@/lib/aircraft-lookup'
import { denied, requireActiveUser } from '@/lib/supabase/require-module'
import { type NextRequest, NextResponse } from 'next/server'

// GET /api/aircraft/lookup?tail=N868CB
//   200 { result: AircraftLookupResult }  registry hit
//   200 { result: null }                  unknown tail or lookup failed
//   400 { error }                         missing or invalid tail (letters, digits, dash; max 10)
//   401 { error }                         not signed in
//   403 { error }                         account disabled
const TAIL_PATTERN = /^[A-Z0-9-]{1,10}$/

export async function GET(request: NextRequest) {
  // The tail field exists on flight, parking and truck-sheet forms, so any active user with a role may look one up.
  const check = await requireActiveUser()
  if (!check.ok) return denied(check)

  const tail = normalizeTail(request.nextUrl.searchParams.get('tail') ?? '')
  if (!TAIL_PATTERN.test(tail)) {
    return NextResponse.json(
      { error: 'A valid tail number is required' },
      { status: 400 }
    )
  }

  const result = await lookupAircraftType(tail)
  return NextResponse.json({ result })
}
