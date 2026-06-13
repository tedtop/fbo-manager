'use client'

import { useAuth } from '@/providers/auth-provider'

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

export function useSession() {
  const { session } = useAuth()

  const status: SessionStatus =
    session === undefined
      ? 'loading'
      : session === null
        ? 'unauthenticated'
        : 'authenticated'

  return { data: session ?? null, status }
}
