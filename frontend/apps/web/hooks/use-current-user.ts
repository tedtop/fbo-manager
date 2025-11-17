'use client'

import type { UserCurrent } from '@frontend/types/api'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import { getApiClient } from '../lib/api'

export function useCurrentUser() {
  const { data: session } = useSession()
  const [user, setUser] = useState<UserCurrent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchUser = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const client = await getApiClient(session)
      const me = await client.users.usersMeRetrieve()
      setUser(me)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load user'))
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) fetchUser()
    else setLoading(false)
  }, [session, fetchUser])

  return { user, loading, error, refetch: fetchUser }
}
