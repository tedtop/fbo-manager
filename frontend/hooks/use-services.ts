'use client'

import { createClient } from '@/lib/supabase/client'
import { findActiveServices } from '@/repositories/services.repo'
import { useQuery } from '@tanstack/react-query'

export const serviceKeys = {
  all: ['services'] as const,
  active: () => [...serviceKeys.all, 'active'] as const
}

// The board service catalog (active rows, catalog order). It changes rarely, so it is cached for 5 minutes.
export function useServices() {
  const db = createClient()

  const query = useQuery({
    queryKey: serviceKeys.active(),
    queryFn: () => findActiveServices(db),
    staleTime: 5 * 60 * 1000
  })

  return {
    services: query.data ?? [],
    loading: query.isLoading,
    error: query.error
  }
}
