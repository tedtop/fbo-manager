'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type TransactionFilters,
  type TransactionInsert,
  type TransactionUpdate,
  type TransactionWithRelations,
  createTransaction,
  findAllTransactions,
  updateTransaction
} from '@/repositories/transactions.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (filters?: TransactionFilters) =>
    [...transactionKeys.lists(), filters] as const
}

export function useTransactions(filters?: TransactionFilters) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: () => findAllTransactions(db, filters)
  })

  const createMutation = useMutation({
    mutationFn: (tx: TransactionInsert) => createTransaction(db, tx),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all })
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
      expectedModifiedAt
    }: {
      id: number
      updates: TransactionUpdate
      expectedModifiedAt?: string
    }) => updateTransaction(db, id, updates, expectedModifiedAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: transactionKeys.all })
  })

  return {
    transactions: query.data ?? ([] as TransactionWithRelations[]),
    loading: query.isLoading,
    error: query.error,
    createTransaction: (tx: TransactionInsert) =>
      createMutation.mutateAsync(tx),
    updateTransaction: (
      id: number,
      updates: TransactionUpdate,
      expectedModifiedAt?: string
    ) => updateMutation.mutateAsync({ id, updates, expectedModifiedAt }),
    refetch: query.refetch
  }
}
