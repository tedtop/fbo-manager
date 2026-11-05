'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QTDispatch, QTDispatchChange } from '@/types/qt-dispatch'

const DISPATCH_ENDPOINT = '/api/qt/dispatch'
const POLL_SECONDS = 30

interface UseQTDispatchReturn {
  dispatches: QTDispatch[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  refreshCountdown: number
  refetch: () => Promise<void>
  changes: QTDispatchChange[]
}

// QT's ChangeFlags is a per-flight counter that only goes up; a rise means fuel, gate or times moved.
function dispatchKey(d: QTDispatch): string {
  return String(d.TransactionID ?? `${d.FlightNumber}_${d.TailNumber}`)
}

function detectChanges(next: QTDispatch[], previous: Map<string, QTDispatch>): QTDispatchChange[] {
  if (previous.size === 0) return []

  const detected: QTDispatchChange[] = []
  for (const flight of next) {
    const old = previous.get(dispatchKey(flight))
    if (!old) {
      detected.push({
        type: 'new_flight',
        flight,
        message: `New flight added: ${flight.FlightNumber} to ${flight.Destination}`
      })
    } else if ((flight.ChangeFlags ?? 0) > (old.ChangeFlags ?? 0)) {
      const base = `${flight.FlightNumber} to ${flight.Destination} (${flight.TailNumber})`
      detected.push({
        type: 'dispatch_update',
        flight,
        oldChangeFlags: old.ChangeFlags,
        newChangeFlags: flight.ChangeFlags,
        message:
          flight.QuantityInWeight > 0
            ? `${base} requested ${flight.QuantityInWeight} lbs of fuel`
            : `${base} - Dispatch updated`
      })
    }
  }
  return detected
}

export function useQTDispatch(): UseQTDispatchReturn {
  const [dispatches, setDispatches] = useState<QTDispatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshCountdown, setRefreshCountdown] = useState(POLL_SECONDS)
  const [changes, setChanges] = useState<QTDispatchChange[]>([])

  const previousRef = useRef<Map<string, QTDispatch>>(new Map())
  const inFlightRef = useRef(false)

  const fetchDispatchData = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const response = await fetch(DISPATCH_ENDPOINT, { cache: 'no-store' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || `Dispatch server error ${response.status}`)
      }
      if (!data?.Success) {
        throw new Error(data?.ErrorMessage || 'QT returned an error for the dispatch list')
      }

      const next: QTDispatch[] = data.Detail?.Dispatches ?? []
      const detected = detectChanges(next, previousRef.current)
      if (detected.length > 0) setChanges(detected)
      previousRef.current = new Map(next.map((d) => [dispatchKey(d), d]))

      setDispatches(next)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispatch data')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  // One tick per second drives both the visible countdown and the poll.
  const secondsRef = useRef(POLL_SECONDS)
  useEffect(() => {
    fetchDispatchData()
    const timer = setInterval(() => {
      secondsRef.current -= 1
      if (secondsRef.current <= 0) {
        secondsRef.current = POLL_SECONDS
        fetchDispatchData()
      }
      setRefreshCountdown(secondsRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [fetchDispatchData])

  const refetch = useCallback(async () => {
    secondsRef.current = POLL_SECONDS
    setRefreshCountdown(POLL_SECONDS)
    await fetchDispatchData()
  }, [fetchDispatchData])

  return { dispatches, loading, error, lastUpdated, refreshCountdown, refetch, changes }
}
