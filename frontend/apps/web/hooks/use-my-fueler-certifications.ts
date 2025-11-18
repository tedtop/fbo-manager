'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import { getApiClient } from '@/lib/api'
import type { FuelerTraining } from '@frontend/types/api'

interface UseMyFuelerCertificationsResult {
  certifications: FuelerTraining[]
  loading: boolean
  error: Error | null
  fuelerId: number | null
  refetch: () => void
}

export function useMyFuelerCertifications(): UseMyFuelerCertificationsResult {
  const { data: session } = useSession()
  const [fuelerId] = useState<number | null>(null)
  const [certifications, setCertifications] = useState<FuelerTraining[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchCerts = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const client = await getApiClient(session)
      const base = client["BASE"] || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const res = await fetch(`${base}/api/fuelers/my-certifications/`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`
        }
      })
      if (!res.ok) throw new Error('Failed to fetch my certifications')
      const data = await res.json()
      setCertifications(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load certifications'))
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) fetchCerts()
    else setLoading(false)
  }, [session, fetchCerts])

  return { certifications, loading, error, fuelerId, refetch: fetchCerts }
}
