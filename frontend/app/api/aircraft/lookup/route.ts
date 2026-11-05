import { lookupAircraftType, normalizeTail } from '@/lib/aircraft-lookup'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

// GET /api/aircraft/lookup?tail=N868CB
//   200 { result: AircraftLookupResult }  registry hit
//   200 { result: null }                  unknown tail or lookup failed
//   400 { error }                         missing or invalid tail (letters, digits, dash; max 10)
//   401 { error }                         not signed in
const TAIL_PATTERN = /^[A-Z0-9-]{1,10}$/

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

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
