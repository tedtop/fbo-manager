'use client'

import { createClient } from '@/lib/supabase/client'
import { findUnbilledFuelings } from '@/repositories/fueling-events.repo'
import {
  type InvoiceFilters,
  type InvoiceWithItems,
  type NewInvoiceInput,
  type SettledVia,
  createInvoice,
  deleteDraftInvoice,
  findInvoices,
  replaceDraftInvoice,
  settleInvoice,
  suggestNextInvoiceNumber,
  voidInvoice
} from '@/repositories/invoices.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) =>
    [
      ...invoiceKeys.all,
      'list',
      filters.search ?? '',
      filters.status ?? 'all'
    ] as const,
  nextNumber: () => [...invoiceKeys.all, 'next-number'] as const,
  unbilled: () => [...invoiceKeys.all, 'unbilled-fuelings'] as const
}

export function useInvoices(filters: InvoiceFilters = {}) {
  const qc = useQueryClient()
  const db = createClient()

  const query = useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => findInvoices(db, filters)
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: invoiceKeys.all })
  }

  const createMutation = useMutation({
    mutationFn: (input: NewInvoiceInput) => createInvoice(db, input),
    onSuccess: invalidate
  })

  const settleMutation = useMutation({
    mutationFn: ({
      id,
      settledVia,
      reference
    }: {
      id: number
      settledVia: SettledVia
      reference: string | null
    }) => settleInvoice(db, id, settledVia, reference),
    onSuccess: invalidate
  })

  const voidMutation = useMutation({
    mutationFn: (invoice: InvoiceWithItems) => voidInvoice(db, invoice),
    onSuccess: invalidate
  })

  const replaceDraftMutation = useMutation({
    mutationFn: ({
      draft,
      input
    }: { draft: InvoiceWithItems; input: NewInvoiceInput }) =>
      replaceDraftInvoice(db, draft, input),
    onSuccess: invalidate
  })

  const deleteDraftMutation = useMutation({
    mutationFn: (invoice: InvoiceWithItems) => deleteDraftInvoice(db, invoice),
    onSuccess: invalidate
  })

  return {
    invoices: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createInvoice: createMutation.mutateAsync,
    creating: createMutation.isPending,
    settleInvoice: settleMutation.mutateAsync,
    settling: settleMutation.isPending,
    voidInvoice: voidMutation.mutateAsync,
    voiding: voidMutation.isPending,
    replaceDraft: replaceDraftMutation.mutateAsync,
    replacingDraft: replaceDraftMutation.isPending,
    deleteDraft: deleteDraftMutation.mutateAsync,
    deletingDraft: deleteDraftMutation.isPending
  }
}

/** Suggested next invoice number (hand-assignable; suggestion only). */
export function useNextInvoiceNumber(enabled: boolean) {
  const db = createClient()
  const query = useQuery({
    queryKey: invoiceKeys.nextNumber(),
    queryFn: () => suggestNextInvoiceNumber(db),
    enabled,
    staleTime: 0
  })
  return { nextNumber: query.data ?? '', loading: query.isLoading }
}

/** Truck-sheet fueling events with no invoice yet ("bill from truck sheet"). */
export function useUnbilledFuelings(enabled: boolean) {
  const db = createClient()
  const query = useQuery({
    queryKey: invoiceKeys.unbilled(),
    queryFn: () => findUnbilledFuelings(db),
    enabled
  })
  return { fuelings: query.data ?? [], loading: query.isLoading }
}
