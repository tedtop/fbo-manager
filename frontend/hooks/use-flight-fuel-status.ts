'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useMemo, useState } from 'react'

const useUniqueId = (() => {
  let counter = 0
  return () => useMemo(() => ++counter, [])
})()

export function useFlightFuelStatus(flightId: number | string) {
  const db = useMemo(() => createClient(), [])
  const instanceId = useUniqueId()
  const [fueledAt, setFueledAt] = useState<string | null>(null)
  const [completedTransactions, setCompletedTransactions] = useState(0)
  const [loading, setLoading] = useState(true)

  const numericId =
    typeof flightId === 'string' ? Number(flightId) : flightId

  // Initial fetch
  useEffect(() => {
    if (!Number.isFinite(numericId)) {
      setLoading(false)
      return
    }

    let cancelled = false
    const fetch = async () => {
      const { data: txns } = await db
        .from('fuel_transaction')
        .select('completed_at')
        .eq('flight_id', numericId)
        .eq('status', 'filled')
      if (cancelled) return
      setCompletedTransactions(txns?.length ?? 0)

      const { data: flight } = await db
        .from('flight')
        .select('fueled_at')
        .eq('id', numericId)
        .single()
      if (cancelled) return
      setFueledAt(flight?.fueled_at ?? null)
      setLoading(false)
    }
    fetch()

    return () => { cancelled = true }
  }, [numericId, db])

  // Real-time subscription
  useEffect(() => {
    if (!Number.isFinite(numericId)) return

    const channel = db.channel(`flight-fuel-${numericId}-${instanceId}`)

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'fuel_transaction',
        filter: `flight_id=eq.${numericId}`
      },
      () => {
        // A filled order can be edited again (updateFilledOrder), so recount instead of adding one per event.
        db.from('fuel_transaction')
          .select('id', { count: 'exact', head: true })
          .eq('flight_id', numericId)
          .eq('status', 'filled')
          .then(({ count }) => setCompletedTransactions(count ?? 0))
      }
    )

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'flight',
        filter: `id=eq.${numericId}`
      },
      (payload) => {
        const row = payload.new as { fueled_at?: string | null }
        setFueledAt(row.fueled_at ?? null)
      }
    )

    channel.subscribe()

    return () => {
      db.removeChannel(channel)
    }
  }, [numericId, db, instanceId])

  return {
    fueledAt,
    completedTransactions,
    loading,
    isFueled: fueledAt !== null || completedTransactions > 0
  }
}
