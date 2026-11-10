'use client'

import {
  type DispatchChanges,
  type DispatchSnapshot,
  type FlightTrack,
  detectDispatchChanges,
  normalizeTail
} from '@/lib/dispatch-display'
import type { QTDispatch } from '@/types/qt-dispatch'
import { useCallback, useEffect, useRef, useState } from 'react'

const DISPATCH_ENDPOINT = '/api/qt/dispatch'
const FLIGHT_TRACK_ENDPOINT = '/api/qt/flight-track'
const POLL_SECONDS = 30
// Matches the server's ADS-B cache window; and how often "in 12m" text is recomputed between polls.
const FLIGHT_TRACK_INTERVAL_MS = 60_000
const COUNTDOWN_RENDER_INTERVAL_MS = 15_000

export type DispatchErrorStage = 'login_failed' | 'retry_after_login_failed' | null

interface UseQTDispatchReturn {
  dispatches: QTDispatch[]
  loading: boolean
  /** True while a manual or visibility-triggered refresh is in flight (status pill shows "Refreshing..."). */
  refreshing: boolean
  error: string | null
  errorStage: DispatchErrorStage
  lastUpdated: Date | null
  refreshCountdown: number
  refetch: () => Promise<void>
  /** Fuel / gate / time changes seen between polls, keyed by FlightID (see changeKey). */
  changes: Map<string, DispatchChanges>
  /** Live ADS-B overlay keyed by upper-case tail number. */
  flightTrack: Map<string, FlightTrack>
  /** Re-render clock: changes every 15 s so countdowns stay current between polls. */
  now: number
}

export function useQTDispatch(): UseQTDispatchReturn {
  const [dispatches, setDispatches] = useState<QTDispatch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorStage, setErrorStage] = useState<DispatchErrorStage>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshCountdown, setRefreshCountdown] = useState(POLL_SECONDS)
  const [changes, setChanges] = useState<Map<string, DispatchChanges>>(new Map())
  const [flightTrack, setFlightTrack] = useState<Map<string, FlightTrack>>(new Map())
  const [now, setNow] = useState(() => Date.now())

  const snapshotsRef = useRef<Map<string, DispatchSnapshot>>(new Map())
  const changesRef = useRef<Map<string, DispatchChanges>>(new Map())
  const dispatchesRef = useRef<QTDispatch[]>([])
  const inFlightRef = useRef(false)

  const fetchFlightTrack = useCallback(async () => {
    // Not only Planned flights: the live equipment code is worth showing on any status, and the
    // server makes one shared area query however many tails it is asked about.
    const tails = [...new Set(dispatchesRef.current.map((d) => normalizeTail(d.TailNumber)).filter(Boolean))]
    if (tails.length === 0) return
    try {
      const response = await fetch(`${FLIGHT_TRACK_ENDPOINT}?tails=${encodeURIComponent(tails.join(','))}`, {
        cache: 'no-store'
      })
      if (!response.ok) throw new Error(`flight-track responded ${response.status}`)
      const data = await response.json()
      setFlightTrack(
        new Map(
          Object.entries((data.tracked ?? {}) as Record<string, FlightTrack>).map(([tail, track]) => [
            normalizeTail(tail),
            track
          ])
        )
      )
    } catch (err) {
      // Enrichment only: never touches the error banner.
      console.error('Failed to fetch ADS-B flight tracking:', err)
    }
  }, [])

  const fetchDispatchData = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const firstLoad = dispatchesRef.current.length === 0
    try {
      const response = await fetch(DISPATCH_ENDPOINT, { cache: 'no-store' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        // Keep the full server error in the console; the banner gets a plain-English summary.
        if (data?.diagnostics) console.error('QT dispatch proxy diagnostics:', data.diagnostics)
        const stage = data?.diagnostics?.stage
        if (stage === 'login_failed' || stage === 'retry_after_login_failed') {
          setErrorStage(stage)
          setError('QT login is being rejected')
          return
        }
        throw new Error(data?.error || `Dispatch server error ${response.status}`)
      }
      if (!data?.Success) {
        throw new Error('QT error: ' + (data?.ErrorMessage || 'Failed to fetch dispatch data'))
      }

      const next: QTDispatch[] = data.Detail?.Dispatches ?? []
      detectDispatchChanges(next, snapshotsRef.current, changesRef.current)
      setChanges(new Map(changesRef.current))
      dispatchesRef.current = next

      setDispatches(next)
      setLastUpdated(new Date())
      setError(null)
      setErrorStage(null)
      if (firstLoad) void fetchFlightTrack()
    } catch (err) {
      console.error('Fetch error:', err)
      setErrorStage(null)
      setError(
        err instanceof TypeError
          ? 'Connection error: unable to reach the server.'
          : err instanceof Error
            ? err.message
            : 'Failed to fetch dispatch data'
      )
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [fetchFlightTrack])

  // One tick per second drives both the visible countdown and the poll.
  const secondsRef = useRef(POLL_SECONDS)
  useEffect(() => {
    void fetchDispatchData()
    const timer = setInterval(() => {
      secondsRef.current -= 1
      if (secondsRef.current <= 0) {
        secondsRef.current = POLL_SECONDS
        void fetchDispatchData()
      }
      setRefreshCountdown(secondsRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [fetchDispatchData])

  // The ADS-B overlay and the countdown re-render run on their own cadence, alongside the 30 s poll.
  useEffect(() => {
    const track = setInterval(() => void fetchFlightTrack(), FLIGHT_TRACK_INTERVAL_MS)
    const clock = setInterval(() => setNow(Date.now()), COUNTDOWN_RENDER_INTERVAL_MS)
    return () => {
      clearInterval(track)
      clearInterval(clock)
    }
  }, [fetchFlightTrack])

  const refetch = useCallback(async () => {
    secondsRef.current = POLL_SECONDS
    setRefreshCountdown(POLL_SECONDS)
    setRefreshing(true)
    try {
      await fetchDispatchData()
      void fetchFlightTrack()
      setNow(Date.now())
    } finally {
      setRefreshing(false)
    }
  }, [fetchDispatchData, fetchFlightTrack])

  // Refresh immediately when the tab or app regains focus.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  return {
    dispatches,
    loading,
    refreshing,
    error,
    errorStage,
    lastUpdated,
    refreshCountdown,
    refetch,
    changes,
    flightTrack,
    now
  }
}
