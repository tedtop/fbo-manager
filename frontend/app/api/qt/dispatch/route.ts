import { QtError, fetchQtDispatchDetail } from '@/lib/qt-session'
import { denied, requireModule } from '@/lib/supabase/require-module'
import { NextResponse } from 'next/server'

// GET /api/qt/dispatch
//   200 QT GetDispatchDetail payload ({ Success, Detail: { Dispatches } })
//   401 { error }  not signed in
//   403 { error }  account disabled or no access to the fuel_farm module
//   500/502 { error }  QT misconfigured, or it rejected us even after a fresh login
export const dynamic = 'force-dynamic'

export async function GET() {
  const check = await requireModule('fuel_farm')
  if (!check.ok) return denied(check)

  try {
    return NextResponse.json(await fetchQtDispatchDetail())
  } catch (error) {
    console.error('QT Dispatch error:', error)
    const status = error instanceof QtError ? error.status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status }
    )
  }
}
