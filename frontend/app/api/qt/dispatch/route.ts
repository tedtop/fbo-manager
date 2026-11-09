import { recordDispatchHistory } from '@/lib/dispatch-history'
import { QtError, fetchQtDispatchDetail } from '@/lib/qt-session'
import { denied, requireModule } from '@/lib/supabase/require-module'
import { NextResponse } from 'next/server'

// GET /api/qt/dispatch
//   200 QT GetDispatchDetail payload ({ Success, Detail: { Dispatches } })
//   401 { error }  not signed in
//   403 { error }  account disabled or no access to the fuel_farm module
//   500/502 { error, diagnostics?: { stage } }  QT misconfigured, or it rejected us even after a
//        fresh login (stage says which: the page words its banner from it)
// Every successful poll is also appended to fuel_dispatch_history, as Minuteman's proxy does.
export const dynamic = 'force-dynamic'

export async function GET() {
  const check = await requireModule('fuel_farm')
  if (!check.ok) return denied(check)

  try {
    const data = await fetchQtDispatchDetail()
    const dispatches = (data.Detail as { Dispatches?: Parameters<typeof recordDispatchHistory>[0] } | undefined)
      ?.Dispatches
    void recordDispatchHistory(dispatches)
    return NextResponse.json(data)
  } catch (error) {
    console.error('QT Dispatch error:', error)
    const status = error instanceof QtError ? error.status : 500
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        ...(error instanceof QtError && error.stage ? { diagnostics: { stage: error.stage } } : {})
      },
      { status }
    )
  }
}
