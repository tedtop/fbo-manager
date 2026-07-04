import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type FuelerAssignmentRow = Tables<'fueler_assignment'>
export type FuelerAssignmentInsert = TablesInsert<'fueler_assignment'>

export async function assignFuelerToTransaction(
  db: SupabaseClient<Database>,
  assignment: FuelerAssignmentInsert
): Promise<FuelerAssignmentRow> {
  const { data, error } = await db
    .from('fueler_assignment')
    .insert(assignment)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeFuelerFromTransaction(
  db: SupabaseClient<Database>,
  transactionId: number,
  fuelerId: number
): Promise<void> {
  const { error } = await db
    .from('fueler_assignment')
    .delete()
    .eq('transaction_id', transactionId)
    .eq('fueler_id', fuelerId)
  if (error) throw error
}

export async function findAssignmentsByTransactionId(
  db: SupabaseClient<Database>,
  transactionId: number
): Promise<FuelerAssignmentRow[]> {
  const { data, error } = await db
    .from('fueler_assignment')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('assigned_at')
  if (error) throw error
  return data
}
