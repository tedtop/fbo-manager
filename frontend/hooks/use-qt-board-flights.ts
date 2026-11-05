'use client'

import type { Flight } from '@/components/flight-operations/types'
import { qtDispatchesToFlights } from '@/lib/qt-flights'
import type { QTDispatch } from '@/types/qt-dispatch'
import { useEffect, useMemo, useState } from 'react'

const POLL_MS = 30_000

// The live QT airline dispatches as board flights. Quiet by design: when the user has no Fuel Farm
// access (403) or QT is down, the board simply shows no airline flights rather than an error banner.
export function useQtBoardFlights(fboZone: string, enabled = true): Flight[] {
  const [dispatches, setDispatches] = useState<QTDispatch[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/qt/dispatch', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && data?.Success) setDispatches(data.Detail?.Dispatches ?? [])
      } catch {
        // keep the last good list
      }
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  return useMemo(() => qtDispatchesToFlights(dispatches, fboZone), [dispatches, fboZone])
}
