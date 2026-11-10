import { requireActiveUser, denied } from '@/lib/supabase/require-module'
import { NextResponse } from 'next/server'

// GET /api/metar -> { success, metar }  Current KMSO METAR proxied from aviationweather.gov, which
// sends no CORS headers so the browser cannot call it directly (ported from Minuteman's api/metar.js).
const METAR_URL = 'https://aviationweather.gov/api/data/metar?ids=KMSO&format=json'
export const dynamic = 'force-dynamic'

export async function GET() {
  const check = await requireActiveUser()
  if (!check.ok) return denied(check)
  try {
    const response = await fetch(METAR_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`aviationweather.gov returned status ${response.status}`)
    const data = await response.json()
    return NextResponse.json({ success: true, metar: Array.isArray(data) ? (data[0] ?? null) : null })
  } catch (error) {
    console.error('METAR proxy error:', error)
    return NextResponse.json(
      { success: false, error: 'METAR proxy error: ' + (error instanceof Error ? error.message : error) },
      { status: 500 }
    )
  }
}
