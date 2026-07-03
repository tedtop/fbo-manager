'use client'

import { createClient } from '@/lib/supabase/client'
import { findActiveProducts } from '@/repositories/products.repo'
import { useQuery } from '@tanstack/react-query'

export const productKeys = {
  all: ['products'] as const,
  active: () => [...productKeys.all, 'active'] as const
}

export function useProducts() {
  const db = createClient()

  const query = useQuery({
    queryKey: productKeys.active(),
    queryFn: () => findActiveProducts(db)
  })

  return {
    products: query.data ?? [],
    loading: query.isLoading,
    error: query.error
  }
}
