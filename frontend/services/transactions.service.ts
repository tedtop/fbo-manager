import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  assignFuelerToTransaction,
  removeFuelerFromTransaction
} from '@/repositories/fueler-assignments.repo'
import { findTransactionById } from '@/repositories/transactions.repo'
import { assignFuelOrder } from '@/services/fuel-orders.service'

/**
 * Adds a fueler to an order. The first fueler on a `requested` order also moves it to `assigned`; further
 * fuelers on an order that is already assigned or fueling are only linked.
 */
export async function assignFueler(
  db: SupabaseClient<Database>,
  transactionId: number,
  fuelerId: number
): Promise<void> {
  const tx = await findTransactionById(db, transactionId)
  if (tx?.status === 'requested') {
    await assignFuelOrder(db, transactionId, fuelerId)
    return
  }
  await assignFuelerToTransaction(db, { transaction_id: transactionId, fueler_id: fuelerId })
}

export async function removeFueler(
  db: SupabaseClient<Database>,
  transactionId: number,
  fuelerId: number
): Promise<void> {
  await removeFuelerFromTransaction(db, transactionId, fuelerId)
}
