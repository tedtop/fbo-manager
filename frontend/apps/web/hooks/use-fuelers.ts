'use client'

import { createClient } from '@/lib/supabase/client'
import { findActiveFuelers, findAllFuelers } from '@/repositories/fuelers.repo'
import { useQuery } from '@tanstack/react-query'

export const fuelerKeys = {
  all: ['fuelers'] as const,
  active: () => [...fuelerKeys.all, 'active'] as const
}

export function useFuelers(activeOnly = false) {
  const db = createClient()

  const query = useQuery({
    queryKey: activeOnly ? fuelerKeys.active() : fuelerKeys.all,
    queryFn: () => (activeOnly ? findActiveFuelers(db) : findAllFuelers(db))
  })

  return {
    fuelers: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
