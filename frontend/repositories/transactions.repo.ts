import { ConcurrencyConflictError } from '@/lib/concurrency'
import { handleWriteError } from '@/lib/db-errors'
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
  if (error) {
    // Most likely invoice_line_items_fuel_transaction_id_fkey (ON DELETE
    // RESTRICT — this fueling is already billed on an invoice). Translated
    // into a clear message and logged; see lib/db-errors.ts.
    await handleWriteError(db, error, {
      source: 'transactions.repo.deleteTransaction',
      context: { fuel_transaction_id: id }
    })
  }
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

/**
 * Optional per-tank before/after readings for airline fuelings, as fixed,
 * explicitly-named columns on fuel_transaction (not a normalized per-row
 * table — see docs/architecture/fuel-invoicing-workflow.md for why: fixed
 * columns let plain SQL (AVG/GROUP BY) aggregate directly for analytics
 * like "average fuel taken by airline X", where a pivoted EAV-style table
 * would need a pivot on every query).
 *
 * `center` is a real third tank on 737s; E175 has no center tank (its L/R/T
 * layout's "T" is the Total reading, not a tank) so `center` stays null for
 * E175 fuelings. `total` is recorded for both. All eight fields — and the
 * whole group — are optional: GA fuelings simply never set any of these.
 */
export interface TankReadings {
  before_left: number | null
  before_right: number | null
  before_center: number | null
  before_total: number | null
  after_left: number | null
  after_right: number | null
  after_center: number | null
  after_total: number | null
  unit?: 'lbs' | 'gal' | 'kg'
}

function numOrNull(v: string | null): number | null {
  return v == null ? null : Number(v)
}

/**
 * Reads back the eight tank-reading columns as the TankReadings shape.
 * Postgres numeric columns come back from PostgREST as strings (same as
 * fuel_transaction.quantity_gallons etc.) — converted to numbers here so
 * callers get plain numbers, matching the shape updateTankReadings accepts.
 */
export async function findTankReadings(
  db: SupabaseClient<Database>,
  transactionId: number
): Promise<TankReadings | null> {
  const { data, error } = await db
    .from('fuel_transaction')
    .select(
      'tank_reading_before_left, tank_reading_before_right, tank_reading_before_center, tank_reading_before_total, tank_reading_after_left, tank_reading_after_right, tank_reading_after_center, tank_reading_after_total, tank_reading_unit'
    )
    .eq('id', transactionId)
    .single()
  if (error) throw error
  if (
    data.tank_reading_before_left == null &&
    data.tank_reading_before_right == null &&
    data.tank_reading_before_center == null &&
    data.tank_reading_before_total == null &&
    data.tank_reading_after_left == null &&
    data.tank_reading_after_right == null &&
    data.tank_reading_after_center == null &&
    data.tank_reading_after_total == null
  ) {
    return null
  }
  return {
    before_left: numOrNull(data.tank_reading_before_left),
    before_right: numOrNull(data.tank_reading_before_right),
    before_center: numOrNull(data.tank_reading_before_center),
    before_total: numOrNull(data.tank_reading_before_total),
    after_left: numOrNull(data.tank_reading_after_left),
    after_right: numOrNull(data.tank_reading_after_right),
    after_center: numOrNull(data.tank_reading_after_center),
    after_total: numOrNull(data.tank_reading_after_total),
    unit: data.tank_reading_unit
  }
}

/**
 * Sets (or clears, by passing all-null fields) the per-tank readings for an
 * airline fueling. A plain field-for-field update — this is 1:1 data on
 * fuel_transaction, not a related table, so there's nothing to replace/merge.
 */
export async function updateTankReadings(
  db: SupabaseClient<Database>,
  transactionId: number,
  readings: TankReadings
): Promise<TransactionRow> {
  return updateTransaction(db, transactionId, {
    tank_reading_before_left: readings.before_left,
    tank_reading_before_right: readings.before_right,
    tank_reading_before_center: readings.before_center,
    tank_reading_before_total: readings.before_total,
    tank_reading_after_left: readings.after_left,
    tank_reading_after_right: readings.after_right,
    tank_reading_after_center: readings.after_center,
    tank_reading_after_total: readings.after_total,
    ...(readings.unit ? { tank_reading_unit: readings.unit } : {})
  })
}
