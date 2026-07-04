import { ConcurrencyConflictError } from '@/lib/concurrency'
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  fueler_assignments:fueler_assignment ( id, fueler_id, assigned_at, fueler:fueler_id ( id, fueler_name ) ),
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

/**
 * Creates a dispatch record. This is deliberately the single, clean entry
 * point for "a fueling happened / was called in" — dispatch UI, digital
 * ticket entry, and (future phase, see
 * docs/architecture/fuel-invoicing-workflow.md) an AI chatbot tool-call all
 * funnel through here. Keep it callable with just the radioed-in minimum:
 * tail number, customer, gallons, free-form fuel_request. Meter numbers
 * arrive later via truck-sheet scan reconciliation (linkReadingToTransaction).
 */
export async function createTransaction(
  db: SupabaseClient<Database>,
  tx: TransactionInsert
): Promise<TransactionRow> {
  const { data, error } = await db
    .from('fuel_transaction')
    .insert(tx)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Update a transaction. When `expectedModifiedAt` is provided, the write is
 * an atomic compare-and-swap: it only applies if the row's `modified_at`
 * still matches what the caller loaded. If someone else saved a change in
 * between, zero rows match and this throws ConcurrencyConflictError instead
 * of silently overwriting their edit. Omit `expectedModifiedAt` to write
 * unconditionally (e.g. the "overwrite anyway" path).
 */
export async function updateTransaction(
  db: SupabaseClient<Database>,
  id: number,
  updates: TransactionUpdate,
  expectedModifiedAt?: string
): Promise<TransactionRow> {
  let query = db.from('fuel_transaction').update(updates).eq('id', id)
  if (expectedModifiedAt) {
    query = query.eq('modified_at', expectedModifiedAt)
  }
  const { data, error } = await query.select().single()
  if (error) {
    if (expectedModifiedAt && error.code === 'PGRST116') {
      throw new ConcurrencyConflictError('fuel_transaction', id)
    }
    throw error
  }
  return data
}

export async function deleteTransaction(
  db: SupabaseClient<Database>,
  id: number
): Promise<void> {
  const { error } = await db.from('fuel_transaction').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// Dispatch → invoicing workflow
// (see docs/architecture/fuel-invoicing-workflow.md)
// ============================================================

/**
 * Best-effort gallons from a free-form fuel request. 'T/O', 'Fill', lbs
 * requests ('2700 lbs') and anything else non-obvious return null — per the
 * domain spec, gallons_requested is optional and never guessed at.
 * Examples: '300' → 300, '110/s Jet A+' → 110, '1,249 gal' → 1249.
 */
export function parseGallonsRequested(
  fuelRequest: string | null | undefined
): number | null {
  if (!fuelRequest) return null
  const text = fuelRequest.trim()
  const match = text.match(/^([\d,]+(?:\.\d+)?)/)
  if (!match) return null
  if (/^\s*(?:lbs?|#|kgs?)\b/i.test(text.slice(match[0].length))) return null
  const n = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export type UninvoicedTransaction = TransactionWithRelations & {
  invoice_line_items: Array<{ id: number }>
}

/**
 * Completed fuelings with no invoice line yet — the front desk's
 * "not yet invoiced" queue (and the view a future chatbot-created
 * transaction lands in). PostgREST can't express NOT EXISTS, so the
 * referencing line items are embedded and empties filtered client-side,
 * mirroring findUnbilledFuelings in fueling-events.repo.ts.
 */
export async function findUninvoicedTransactions(
  db: SupabaseClient<Database>,
  days = 14
): Promise<UninvoicedTransaction[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await db
    .from('fuel_transaction')
    .select(`${TX_SELECT}, invoice_line_items ( id )`)
    .eq('progress', 'completed')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = data as unknown as UninvoicedTransaction[]
  return rows.filter((tx) => tx.invoice_line_items.length === 0)
}

export type MatchCandidate = TransactionRow & {
  truck_meter_readings: Array<{ id: number }>
}

/**
 * Dispatch records that plausibly correspond to a scanned truck-sheet row,
 * for the async reconciliation step. Matching is deliberately loose (the
 * resilience requirement: scanned data is incomplete and inconsistent):
 * same tail number, created within the sheet date ± 1 day (night shift
 * crosses midnight). Already-linked readings are embedded so callers can
 * rank unlinked transactions first — a candidate with existing links is
 * still valid (one fueling can span front + rear register rows).
 */
export async function findMatchCandidates(
  db: SupabaseClient<Database>,
  input: { tailNumber: string | null; sheetDate: string }
): Promise<MatchCandidate[]> {
  if (!input.tailNumber?.trim()) return []

  const dayStart = new Date(`${input.sheetDate}T00:00:00Z`)
  const from = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000)
  const to = new Date(dayStart.getTime() + 2 * 24 * 60 * 60 * 1000)

  const { data, error } = await db
    .from('fuel_transaction')
    .select('*, truck_meter_readings ( id )')
    .ilike('tail_number', input.tailNumber.trim())
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as MatchCandidate[]
}

/**
 * Links a scanned truck-sheet row to its dispatch record (the async
 * reconciliation write). Also backfills gallons_delivered from the sheet's
 * gallons-pumped figure when dispatch never got one — the scan is the
 * better source for numbers that were skipped on the radio.
 */
export async function linkReadingToTransaction(
  db: SupabaseClient<Database>,
  readingId: number,
  transactionId: number
): Promise<void> {
  const { error } = await db
    .from('truck_meter_readings')
    .update({ fuel_transaction_id: transactionId })
    .eq('id', readingId)
  if (error) throw error

  const { data: tx, error: txError } = await db
    .from('fuel_transaction')
    .select('id, gallons_delivered')
    .eq('id', transactionId)
    .single()
  if (txError) throw txError

  if (tx.gallons_delivered == null) {
    const { data: reading, error: readingError } = await db
      .from('truck_meter_readings')
      .select('gallons_pumped')
      .eq('id', readingId)
      .single()
    if (readingError) throw readingError
    if (reading.gallons_pumped != null) {
      const { error: backfillError } = await db
        .from('fuel_transaction')
        .update({ gallons_delivered: reading.gallons_pumped })
        .eq('id', transactionId)
      if (backfillError) throw backfillError
    }
  }
}

export async function unlinkReading(
  db: SupabaseClient<Database>,
  readingId: number
): Promise<void> {
  const { error } = await db
    .from('truck_meter_readings')
    .update({ fuel_transaction_id: null })
    .eq('id', readingId)
  if (error) throw error
}

export type TankReadingRow = Tables<'fuel_transaction_tank_readings'>
export type TankReadingInput = {
  tank_position: string // e.g. 'L' / 'C' / 'R' (737), 'L' / 'R' / 'T' (E175) — free-form by design
  reading_before: number | null
  reading_after: number | null
  reading_unit?: 'lbs' | 'gal' | 'kg'
}

export async function findTankReadings(
  db: SupabaseClient<Database>,
  transactionId: number
): Promise<TankReadingRow[]> {
  const { data, error } = await db
    .from('fuel_transaction_tank_readings')
    .select('*')
    .eq('fuel_transaction_id', transactionId)
    .order('tank_position')
  if (error) throw error
  return data
}

/**
 * Replaces the optional per-tank before/after readings for an airline
 * fueling (GA transactions simply never call this). Delete-then-insert
 * keeps the (transaction, position) set exactly what the caller supplied.
 */
export async function replaceTankReadings(
  db: SupabaseClient<Database>,
  transactionId: number,
  readings: TankReadingInput[]
): Promise<TankReadingRow[]> {
  const { error: clearError } = await db
    .from('fuel_transaction_tank_readings')
    .delete()
    .eq('fuel_transaction_id', transactionId)
  if (clearError) throw clearError

  if (readings.length === 0) return []
  const { data, error } = await db
    .from('fuel_transaction_tank_readings')
    .insert(
      readings.map((r) => ({ ...r, fuel_transaction_id: transactionId }))
    )
    .select()
  if (error) throw error
  return data
}
