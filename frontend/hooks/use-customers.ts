'use client'

import { createClient } from '@/lib/supabase/client'
import {
  findAllCustomers,
  createCustomer,
  type CustomerInsert,
} from '@/repositories/customers.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const KEYS = {
  all:  ['customers'] as const,
  list: () => [...KEYS.all, 'list'] as const,
}

export function useCustomers() {
  const db = createClient()
  return useQuery({
    queryKey: KEYS.list(),
    queryFn:  () => findAllCustomers(db),
  })
}

export function useCreateCustomer() {
  const db = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (customer: CustomerInsert) => createCustomer(db, customer),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
