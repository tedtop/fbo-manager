'use client'

import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { findUserByEmail } from '@/repositories/users.repo'
import { useQuery } from '@tanstack/react-query'

export function useCurrentUser() {
  const { session } = useAuth()
  const db = createClient()

  const query = useQuery({
    queryKey: ['current-user', session?.user?.email],
    queryFn: async () => {
      if (!session?.user?.email) return null
      return findUserByEmail(db, session.user.email)
    },
    enabled: !!session?.user?.email
  })

  return {
    user: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
