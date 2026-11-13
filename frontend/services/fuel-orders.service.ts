import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  assignPatch,
  cancelPatch,
  createPatch,
  fillPatch,
  reopenPatch,
  startPatch,
  updateFilledPatch,
  type FillInput,
  type FuelOrderPatch
} from '@/lib/fuel-orders'
import { assignFuelerToTransaction } from '@/repositories/fueler-assignments.repo'
import {
  createTransaction,
  findTransactionById,
  updateTransaction,
  type TransactionInsert,
  type TransactionRow
} from '@/repositories/transactions.repo'

/**
 * Fuel order lifecycle (D22). Service functions only, no UI logic, so a future chatbot tool (B64) can call them.
 * The rules live in lib/fuel-orders.ts; each function here loads the order, asks the pure module for the patch
 * (which throws FuelOrderTransitionError when the move is illegal) and writes it compare-and-swap on updated_at,
 * so two people moving the same order cannot both win (ConcurrencyConflictError for the loser).
 */
type Db = SupabaseClient<Database>

export type NewFuelOrder = Omit<
  TransactionInsert,
  'status' | 'gallons_delivered' | 'completed_at' | 'filled_by' | 'cancel_reason'
> & {
  /** `requested` (board, phone) by default; `filled` for QT, walk-ups after the fact and scan "No order". */
  status?: 'requested' | 'filled'
  /** Required, more than zero, when `status` is `filled`. */
  gallons_delivered?: number
  filled_by?: number | null
}

/** Creates an order. The ticket number comes from the database sequence (FO-n) unless one is given. */
export async function createFuelOrder(
  db: Db,
  input: NewFuelOrder,
  now: Date = new Date()
): Promise<TransactionRow> {
  const { status = 'requested', ...fields } = input
  const patch = createPatch(
    status,
    { gallonsDelivered: fields.gallons_delivered, filledBy: fields.filled_by },
    now
  )
  return createTransaction(db, { ...fields, ...patch })
}

async function applyTransition(
  db: Db,
  id: number,
  makePatch: (current: TransactionRow) => FuelOrderPatch,
  beforeWrite?: () => Promise<void>
): Promise<TransactionRow> {
  const current = await findTransactionById(db, id)
  if (!current) throw new Error(`Fuel order ${id} not found`)
  const patch = makePatch(current)
  await beforeWrite?.()
  return updateTransaction(db, id, patch, current.updated_at)
}

/** requested -> assigned. Optionally links the fueler (relic fueler table, replaced in B122). */
export function assignFuelOrder(
  db: Db,
  id: number,
  fuelerId?: number,
  now: Date = new Date()
): Promise<TransactionRow> {
  return applyTransition(
    db,
    id,
    (c) => assignPatch(c.status, now),
    fuelerId == null
      ? undefined
      : () => assignFuelerToTransaction(db, { transaction_id: id, fueler_id: fuelerId }).then(() => undefined)
  )
}

/** assigned -> fueling. */
export function startFuelOrder(db: Db, id: number): Promise<TransactionRow> {
  return applyTransition(db, id, (c) => startPatch(c.status))
}

/** requested, assigned or fueling -> filled. Stores gallons, the filled time (completed_at) and who filled it. */
export function fillFuelOrder(
  db: Db,
  id: number,
  input: FillInput,
  now: Date = new Date()
): Promise<TransactionRow> {
  return applyTransition(db, id, (c) => fillPatch(c.status, input, now))
}

/** requested, assigned or fueling -> cancelled, with a reason. */
export function cancelFuelOrder(db: Db, id: number, reason: string): Promise<TransactionRow> {
  return applyTransition(db, id, (c) => cancelPatch(c.status, reason))
}

/** cancelled -> requested. */
export function reopenFuelOrder(db: Db, id: number): Promise<TransactionRow> {
  return applyTransition(db, id, (c) => reopenPatch(c.status))
}

/** The only way to change gallons on a filled order. The order stays filled; updated_at records the change. */
export function updateFilledOrder(
  db: Db,
  id: number,
  gallonsDelivered: number
): Promise<TransactionRow> {
  return applyTransition(db, id, (c) => updateFilledPatch(c.status, gallonsDelivered))
}
