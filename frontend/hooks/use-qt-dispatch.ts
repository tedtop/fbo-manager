'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { QTDispatch, QTConfig, QTDispatchChange } from '@/types/qt-dispatch'

const LOCAL_PROXY_URL = ''  // Same origin
const LOGIN_ENDPOINT = '/api/qt/login'
const DISPATCH_ENDPOINT = '/api/qt/dispatch'
const CONFIG_ENDPOINT = '/api/qt/config'
const POLL_INTERVAL = 30000 // 30 seconds

interface UseQTDispatchReturn {
  dispatches: QTDispatch[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  refreshCountdown: number
  refetch: () => Promise<void>
  changes: QTDispatchChange[]
}

export function useQTDispatch(): UseQTDispatchReturn {
  const [dispatches, setDispatches] = useState<QTDispatch[]>([])
  const [previousDispatches, setPreviousDispatches] = useState<QTDispatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshCountdown, setRefreshCountdown] = useState(30)
  const [changes, setChanges] = useState<QTDispatchChange[]>([])

  const qtCookiesRef = useRef<string | null>(null)
  const qtConfigRef = useRef<QTConfig | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Authenticate with QT
  const authenticate = useCallback(async () => {
    try {
      // Get config from server
      const configResponse = await fetch(`${LOCAL_PROXY_URL}${CONFIG_ENDPOINT}`)
      const config: QTConfig = await configResponse.json()

      if (!config.username || !config.password) {
        throw new Error(config.error || 'QT credentials not configured')
      }

      qtConfigRef.current = config

      // Login to QT
      const loginResponse = await fetch(`${LOCAL_PROXY_URL}${LOGIN_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
        }),
      })

      const loginData = await loginResponse.json()

      if (loginResponse.ok && loginData.success) {
        qtCookiesRef.current = loginData.qtCookies
        return true
      } else {
        throw new Error(loginData.message || 'Login failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
      return false
    }
  }, [])

  // Detect changes between old and new dispatches
  const detectChanges = useCallback(
    (newDispatches: QTDispatch[], oldDispatches: QTDispatch[]): QTDispatchChange[] => {
      if (!oldDispatches.length) return []

      const detected: QTDispatchChange[] = []
      const oldMap = new Map(
        oldDispatches.map((d) => [`${d.FlightNumber}_${d.TailNumber}`, d])
      )
      const newMap = new Map(
        newDispatches.map((d) => [`${d.FlightNumber}_${d.TailNumber}`, d])
      )

      // Check for new flights
      for (const [key, flight] of newMap) {
        if (!oldMap.has(key)) {
          detected.push({
            type: 'new_flight',
            flight,
            message: `New flight added: ${flight.FlightNumber} to ${flight.Destination}`,
          })
        }
      }

      // Check for ChangeFlags increments
      for (const [key, newFlight] of newMap) {
        const oldFlight = oldMap.get(key)
        if (
          oldFlight &&
          newFlight.ChangeFlags !== undefined &&
          oldFlight.ChangeFlags !== undefined &&
          newFlight.ChangeFlags > oldFlight.ChangeFlags
        ) {
          let message = `${newFlight.FlightNumber} to ${newFlight.Destination} (${newFlight.TailNumber}) - Dispatch updated`

          if (newFlight.QuantityInWeight && newFlight.QuantityInWeight > 0) {
            message = `${newFlight.FlightNumber} to ${newFlight.Destination} (${newFlight.TailNumber}) requested ${newFlight.QuantityInWeight} lbs of fuel`
          }

          detected.push({
            type: 'dispatch_update',
            flight: newFlight,
            oldChangeFlags: oldFlight.ChangeFlags,
            newChangeFlags: newFlight.ChangeFlags,
            message,
          })
        }
      }

      return detected
    },
    []
  )

  // Fetch dispatch data from QT
  const fetchDispatchData = useCallback(async () => {
    if (!qtConfigRef.current) {
      await authenticate()
      if (!qtConfigRef.current) return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${LOCAL_PROXY_URL}${DISPATCH_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'QT-Cookies': qtCookiesRef.current || '',
        },
        body: JSON.stringify({
          CompanyLocationID: qtConfigRef.current.companyLocationId,
          UserID: qtConfigRef.current.userId,
        }),
      })

      if (response.status === 401) {
        // Session expired, re-authenticate
        await authenticate()
        return fetchDispatchData()
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      const data = await response.json()

      if (data.Success) {
        const newDispatches: QTDispatch[] = data.Detail?.Dispatches || []

        // Detect changes
        const detectedChanges = detectChanges(newDispatches, previousDispatches)
        if (detectedChanges.length > 0) {
          setChanges(detectedChanges)
        }

        setPreviousDispatches(dispatches)
        setDispatches(newDispatches)
        setLastUpdated(new Date())
      } else {
        throw new Error(data.ErrorMessage || 'Failed to fetch dispatch data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispatch data')
    } finally {
      setLoading(false)
    }
  }, [dispatches, previousDispatches, authenticate, detectChanges])

  // Start refresh countdown
  const startRefreshCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }

    setRefreshCountdown(30)

    countdownIntervalRef.current = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          fetchDispatchData()
          return 30
        }
        return prev - 1
      })
    }, 1000)
  }, [fetchDispatchData])

  // Manual refetch
  const refetch = useCallback(async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    await fetchDispatchData()
    startRefreshCountdown()
  }, [fetchDispatchData, startRefreshCountdown])

  // Initialize
  useEffect(() => {
    const init = async () => {
      const success = await authenticate()
      if (success) {
        await fetchDispatchData()
        startRefreshCountdown()
      }
    }

    init()

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, []) // Only run once on mount

  return {
    dispatches,
    loading,
    error,
    lastUpdated,
    refreshCountdown,
    refetch,
    changes,
  }
}
