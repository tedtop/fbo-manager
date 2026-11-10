import { trackTails } from '@/lib/flight-track'
import { denied, requireModule } from '@/lib/supabase/require-module'
import { NextResponse } from 'next/server'

// GET /api/qt/flight-track?tails=N123AB,N456CD
//   200 { tracked: { [tail]: FlightTrack }, fetchedAt, stale }   empty on any ADS-B failure
//   401/403 { error }  not signed in / no fuel_farm access
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const check = await requireModule('fuel_farm')
  if (!check.ok) return denied(check)

  const tails = (new URL(request.url).searchParams.get('tails') ?? '').split(',')
  return NextResponse.json(await trackTails(tails))
}
