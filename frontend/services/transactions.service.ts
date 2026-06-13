import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  updateTransaction,
  type TransactionUpdate
} from '@/repositories/transactions.repo'
import {
  assignFuelerToTransaction,
  removeFuelerFromTransaction
} from '@/repositories/fueler-assignments.repo'

export async function assignFueler(
  db: SupabaseClient<Database>,
  transactionId: number,
  fuelerId: number
): Promise<void> {
  await assignFuelerToTransaction(db, { transaction_id: transactionId, fueler_id: fuelerId })

  // Set assigned_at on the transaction if not already set
  await updateTransaction(db, transactionId, {
    assigned_at: new Date().toISOString(),
    progress: 'in_progress'
  })
}

export async function removeFueler(
  db: SupabaseClient<Database>,
  transactionId: number,
  fuelerId: number
): Promise<void> {
  await removeFuelerFromTransaction(db, transactionId, fuelerId)
}

export async function updateProgress(
  db: SupabaseClient<Database>,
  transactionId: number,
  progress: 'started' | 'in_progress' | 'completed'
): Promise<void> {
  const updates: TransactionUpdate = { progress }
  if (progress === 'completed') {
    updates.completed_at = new Date().toISOString()
  }
  await updateTransaction(db, transactionId, updates)
}
