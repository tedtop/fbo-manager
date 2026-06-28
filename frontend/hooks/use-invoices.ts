'use client'

import { createClient } from '@/lib/supabase/client'
import {
  findAllInvoices,
  findInvoiceById,
  createInvoice,
  createInvoiceItems,
  updateInvoice,
  deleteInvoice,
  type InvoiceInsert,
  type InvoiceUpdate,
  type InvoiceItemInsert,
  type InvoiceFilters,
} from '@/repositories/invoices.repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const KEYS = {
  all:    ['invoices'] as const,
  list:   (filters?: InvoiceFilters) => [...KEYS.all, 'list', filters] as const,
  detail: (id: number) => [...KEYS.all, id] as const,
}

export function useInvoices(filters?: InvoiceFilters) {
  const db = createClient()
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn:  () => findAllInvoices(db, filters),
  })
}

export function useInvoice(id: number | null) {
  const db = createClient()
  return useQuery({
    queryKey: KEYS.detail(id ?? 0),
    queryFn:  () => findInvoiceById(db, id!),
    enabled:  id !== null,
  })
}

export function useCreateInvoice() {
  const db = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      invoice,
      items,
    }: {
      invoice: InvoiceInsert
      items: Omit<InvoiceItemInsert, 'invoice_id'>[]
    }) => {
      const created = await createInvoice(db, invoice)
      const withId  = items.map((item) => ({ ...item, invoice_id: created.id }))
      await createInvoiceItems(db, withId)
      return created
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useUpdateInvoice() {
  const db = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: InvoiceUpdate }) =>
      updateInvoice(db, id, updates),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

export function useDeleteInvoice() {
  const db = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deleteInvoice(db, id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
