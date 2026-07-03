'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type CustomerInsert,
  createCustomer,
  findAllCustomers
} from '@/repositories/customers.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const
}

export function useCustomers() {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: customerKeys.lists(),
    queryFn: () => findAllCustomers(db)
  })

  const createMutation = useMutation({
    mutationFn: (customer: CustomerInsert) => createCustomer(db, customer),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all })
  })

  return {
    customers: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    createCustomer: createMutation.mutateAsync,
    creating: createMutation.isPending
  }
}
