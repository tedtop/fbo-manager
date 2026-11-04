'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createDebouncer, createRefCounted } from '@/lib/realtime-helpers'

const DEBOUNCE_MS = 250
export const FLIGHTS_POLL_MS = 30_000

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'CONNECTING'

// One channel per browser tab, shared by every useFlights consumer (ref-counted).
let status: RealtimeStatus = 'CONNECTING'
let activeQc: QueryClient | null = null
const listeners = new Set<() => void>()
const setStatus = (next: RealtimeStatus) => {
  if (status === next) return
  status = next
  for (const l of listeners) l()
}

const invalidator = createDebouncer(() => {
  activeQc?.invalidateQueries({ queryKey: ['flights'] })
}, DEBOUNCE_MS)

const shared = createRefCounted(() => {
  const db = createClient()
  setStatus('CONNECTING')
  const channel = db
    .channel('flight-board-changes')
    // INSERT / UPDATE / DELETE all land here; a soft delete is an UPDATE that sets deleted_at, which
    // the list query filters out on refetch.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flight' }, () => invalidator.trigger())
    .subscribe((s) => {
      setStatus(s as RealtimeStatus)
      // Catch up on anything missed while disconnected.
      if (s === 'SUBSCRIBED') invalidator.trigger()
    })
  return () => {
    invalidator.cancel()
    db.removeChannel(channel)
    setStatus('CLOSED')
  }
})

const subscribeStatus = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Keeps the flights queries fresh. Returns true while the realtime channel is SUBSCRIBED. */
export function useFlightsRealtime(qc: QueryClient): boolean {
  useEffect(() => {
    activeQc = qc
    return shared.retain()
  }, [qc])
  const current = useSyncExternalStore(subscribeStatus, () => status, () => 'CONNECTING' as RealtimeStatus)
  return current === 'SUBSCRIBED'
}
