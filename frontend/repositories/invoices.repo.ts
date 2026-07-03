import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type InvoiceRow = Tables<'invoice'>
export type InvoiceInsert = TablesInsert<'invoice'>
export type InvoiceUpdate = TablesUpdate<'invoice'>
export type InvoiceItemRow = Tables<'invoice_item'>
export type InvoiceItemInsert = TablesInsert<'invoice_item'>

export type InvoiceWithRelations = InvoiceRow & {
  customer: { id: number; name: string; email: string } | null
  items: InvoiceItemRow[]
}

const INVOICE_SELECT = `
  *,
  customer:customer_id ( id, name, email )
`

export interface InvoiceFilters {
  search?: string      // matches customer name
  status?: InvoiceRow['status']
  startDate?: string
  endDate?: string
}

export async function findAllInvoices(
  db: SupabaseClient<Database>,
  filters?: InvoiceFilters,
  limit = 100
): Promise<InvoiceWithRelations[]> {
  let query = db
    .from('invoice')
    .select(INVOICE_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('created_at', `${filters.endDate}T23:59:59`)
  }

  const { data, error } = await query
  if (error) throw error

  const invoices = data as InvoiceWithRelations[]

  // Client-side search filter on customer name (Supabase doesn't do FK-column ilike in a simple call)
  if (filters?.search) {
    const term = filters.search.toLowerCase()
    return invoices.filter(
      (inv) =>
        inv.customer?.name.toLowerCase().includes(term) ||
        inv.id.toString().includes(term)
    )
  }

  return invoices
}

export async function findInvoiceById(
  db: SupabaseClient<Database>,
  id: number
): Promise<InvoiceWithRelations | null> {
  const { data: inv, error } = await db
    .from('invoice')
    .select(INVOICE_SELECT)
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  if (!inv) return null

  const { data: items, error: itemErr } = await db
    .from('invoice_item')
    .select('*')
    .eq('invoice_id', id)
    .order('id')
  if (itemErr) throw itemErr

  return { ...(inv as InvoiceWithRelations), items: items ?? [] }
}

export async function createInvoice(
  db: SupabaseClient<Database>,
  invoice: InvoiceInsert
): Promise<InvoiceRow> {
  const { data, error } = await db
    .from('invoice')
    .insert(invoice)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createInvoiceItems(
  db: SupabaseClient<Database>,
  items: InvoiceItemInsert[]
): Promise<InvoiceItemRow[]> {
  if (items.length === 0) return []
  const { data, error } = await db.from('invoice_item').insert(items).select()
  if (error) throw error
  return data
}

export async function updateInvoice(
  db: SupabaseClient<Database>,
  id: number,
  updates: InvoiceUpdate
): Promise<InvoiceRow> {
  const { data, error } = await db
    .from('invoice')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInvoice(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('invoice').delete().eq('id', id)
  if (error) throw error
}

export function sumItems(items: Pick<InvoiceItemRow, 'total_price'>[]): number {
  return items.reduce((sum, item) => sum + (Number.parseFloat(item.total_price) || 0), 0)
}
