import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type TransactionRow = Tables<'fuel_transaction'>
export type TransactionInsert = TablesInsert<'fuel_transaction'>
export type TransactionUpdate = TablesUpdate<'fuel_transaction'>

export type TransactionWithRelations = TransactionRow & {
  flight: { id: number; aircraft_id: string; call_sign: string | null } | null
  fueler_assignments: Array<{
    id: number
    fueler_id: number
    assigned_at: string
    fueler: { id: number; fueler_name: string } | null
  }>
  fuel_truck: { id: number; equipment_id: string; equipment_name: string } | null
}

const TX_SELECT = `
  *,
  flight:flight_id ( id, aircraft_id, call_sign ),
  fueler_assignments ( id, fueler_id, assigned_at, fueler:fueler_id ( id, fueler_name ) ),
  fuel_truck:fuel_truck_id ( id, equipment_id, equipment_name )
`

export interface TransactionFilters {
  progress?: 'started' | 'in_progress' | 'completed'
  unassigned?: boolean
  flightId?: number
  source?: 'qt' | 'flight_card' | 'manual'
}

export async function findAllTransactions(
  db: SupabaseClient<Database>,
  filters?: TransactionFilters
): Promise<TransactionWithRelations[]> {
  let query = db
    .from('fuel_transaction')
    .select(TX_SELECT)
    .order('created_at', { ascending: false })

  if (filters?.progress) {
    query = query.eq('progress', filters.progress)
  }
  if (filters?.flightId) {
    query = query.eq('flight_id', filters.flightId)
  }
  if (filters?.source) {
    query = query.eq('source', filters.source)
  }

  const { data, error } = await query
  if (error) throw error
  return data as TransactionWithRelations[]
}

export async function findTransactionById(
  db: SupabaseClient<Database>,
  id: number
): Promise<TransactionWithRelations | null> {
  const { data, error } = await db
    .from('fuel_transaction')
    .select(TX_SELECT)
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as TransactionWithRelations | null
}

export async function createTransaction(
  db: SupabaseClient<Database>,
  tx: TransactionInsert
): Promise<TransactionRow> {
  const { data, error } = await db.from('fuel_transaction').insert(tx).select().single()
  if (error) throw error
  return data
}

export async function updateTransaction(
  db: SupabaseClient<Database>,
  id: number,
  updates: TransactionUpdate
): Promise<TransactionRow> {
  const { data, error } = await db
    .from('fuel_transaction')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTransaction(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('fuel_transaction').delete().eq('id', id)
  if (error) throw error
}
