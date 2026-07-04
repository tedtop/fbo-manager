import {
  type PositionReading,
  lineAmount
} from '@/components/invoicing/ticket-math'
import { handleWriteError } from '@/lib/db-errors'
import {
  type TruckMeterReadingRow,
  deleteFuelingEvent,
  recordFuelingEvent
} from '@/repositories/fueling-events.repo'
import type { Database, Tables, TablesInsert } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export type InvoiceRow = Tables<'invoices'>
export type InvoiceInsert = TablesInsert<'invoices'>
export type InvoiceStatus = InvoiceRow['status']
export type PaymentMethod = NonNullable<InvoiceRow['payment_method']>
export type SettledVia = NonNullable<InvoiceRow['settled_via']>
export type NumberSource = InvoiceRow['number_source']

/**
 * Classifies an invoice number by its shape: a bare 5-digit serial is a
 * pre-printed paper-book number (airline books); everything else — dash
 * format like '26-3330' first among them — is a live number issued by the
 * accounting software. Only a default; callers can override explicitly.
 */
export function inferNumberSource(invoiceNumber: string): NumberSource {
  return /^\d{5}$/.test(invoiceNumber.trim()) ? 'paper_book' : 'live'
}

/** Paper-book invoices whose top copy accounting hasn't collected yet. */
export function isPendingAccountingPickup(
  invoice: Pick<InvoiceRow, 'number_source' | 'accounting_picked_up_at'>
): boolean {
  return (
    invoice.number_source === 'paper_book' &&
    invoice.accounting_picked_up_at == null
  )
}

export type LineItemRow = Tables<'invoice_line_items'>
export type FuelReadingRow = Tables<'invoice_fuel_readings'>
export type TicketFuelType = NonNullable<LineItemRow['fuel_type']>
export type ItemType = LineItemRow['item_type']

export type MeterReadingWithSheet = TruckMeterReadingRow & {
  truck_sheet: {
    id: number
    truck_number: string
    fuel_truck_id: number
    sheet_date: string
  } | null
}

export type LineItemWithDetails = LineItemRow & {
  fuel_readings: FuelReadingRow[]
  meter_reading: MeterReadingWithSheet | null
  fuel_transaction: {
    id: number
    ticket_number: string
    tail_number: string | null
    gallons_delivered: string | null
  } | null
}

export type InvoiceWithItems = InvoiceRow & {
  customer: { id: number; name: string; customer_type: string } | null
  line_items: LineItemWithDetails[]
}

const INVOICE_SELECT = `
  *,
  customer:customer_id ( id, name, customer_type ),
  line_items:invoice_line_items (
    *,
    fuel_readings:invoice_fuel_readings ( * ),
    meter_reading:truck_meter_reading_id (
      *,
      truck_sheet:truck_sheets ( id, truck_number, fuel_truck_id, sheet_date )
    ),
    fuel_transaction:fuel_transaction_id (
      id, ticket_number, tail_number, gallons_delivered
    )
  )
`

export interface InvoiceFilters {
  search?: string
  status?: InvoiceStatus | 'all'
  limit?: number
}

export async function findInvoices(
  db: SupabaseClient<Database>,
  filters: InvoiceFilters = {}
): Promise<InvoiceWithItems[]> {
  let q = db
    .from('invoices')
    .select(INVOICE_SELECT)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200)

  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status)
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[%,()]/g, '')
    q = q.or(
      `invoice_number.ilike.%${term}%,customer_name.ilike.%${term}%,tail_number.ilike.%${term}%`
    )
  }

  const { data, error } = await q
  if (error) throw error
  return data as unknown as InvoiceWithItems[]
}

export async function getInvoiceById(
  db: SupabaseClient<Database>,
  id: number
): Promise<InvoiceWithItems | null> {
  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data as unknown as InvoiceWithItems | null
}

/**
 * Invoice numbers are hand-assigned at Minuteman (and not always sequential
 * with ticket order), so this only suggests: highest all-digit number + 1.
 */
export async function suggestNextInvoiceNumber(
  db: SupabaseClient<Database>
): Promise<string> {
  const { data, error } = await db
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error

  const max = (data ?? [])
    .map((r) => r.invoice_number)
    .filter((n) => /^\d+$/.test(n))
    .reduce((best, n) => Math.max(best, Number(n)), 0)
  return max > 0 ? String(max + 1) : ''
}

export interface FuelLineInput {
  /**
   * The dispatch record this line bills. A fuel_transaction becomes exactly
   * ONE invoice line item — the partial unique index on
   * invoice_line_items.fuel_transaction_id makes double-billing a database
   * error, not a UI convention. When omitted but truckMeterReadingId is
   * set, the reading's already-reconciled transaction (if any) is inherited.
   */
  fuelTransactionId?: number | null
  /** Bill an existing truck-sheet fueling event… */
  truckMeterReadingId?: number
  /** …or record a new one from digital ticket entry. */
  newFueling?: {
    fuelTruckId: number
    truckNumber: string
    meterStart: number | null
    meterStop: number | null
  }
  /**
   * When editing a draft whose fueling event was itself created by digital
   * entry, the stale reading is deleted and newFueling re-records it (the
   * event was never independently observed — the draft was its only source).
   */
  replaceFuelingReadingId?: number
  fuelType: TicketFuelType
  quantityGallons: number
  pricePerGallon: number
  density: number | null
  requestedAmount: string | null
  serviceTime: string | null
  readings: PositionReading[]
}

export interface ServiceLineInput {
  itemType: Exclude<ItemType, 'fuel'>
  productId: number | null
  description: string
  quantity: number
  unitPrice: number
}

export interface NewInvoiceInput {
  header: {
    invoiceNumber: string
    invoiceDate: string // YYYY-MM-DD
    customerId: number | null
    customerName: string
    station: string | null
    tailNumber: string | null
    aircraftType: string | null
    flightId: number | null
    paymentMethod: PaymentMethod | null
    checkNumber: string | null
    salesmanInitials: string | null
    notes: string | null
    /**
     * 'live' = dash-format number ('26-3330') issued immediately by the
     * accounting software; 'paper_book' = pre-printed 5-digit book serial
     * ('21483', airlines), whose carbon copy accounting collects around
     * midday. Omitted → inferred from the number's shape.
     */
    numberSource?: NumberSource
  }
  fuelLine: FuelLineInput | null
  serviceLines: ServiceLineInput[]
  finalize: boolean // false = save draft
}

export const FUEL_TYPE_LABELS: Record<TicketFuelType, string> = {
  jet_a: 'Jet A',
  avgas_100: '100LL',
  avgas_80: '80',
  unleaded: 'Unleaded'
}

/** Truck sheets only distinguish jet_a vs avgas; map ticket fuel to sheet fuel. */
export function toSheetFuelType(fuel: TicketFuelType): 'jet_a' | 'avgas' {
  return fuel === 'jet_a' ? 'jet_a' : 'avgas'
}

function statusFor(input: NewInvoiceInput): {
  status: InvoiceStatus
  paidAt: string | null
} {
  if (!input.finalize) return { status: 'draft', paidAt: null }
  const method = input.header.paymentMethod
  if (method === 'eom' || method === 'roa')
    return { status: 'open', paidAt: null }
  return { status: 'paid', paidAt: new Date().toISOString() }
}

export function invoiceTotal(
  input: Pick<NewInvoiceInput, 'fuelLine' | 'serviceLines'>
): number {
  const fuel = input.fuelLine
    ? lineAmount(input.fuelLine.quantityGallons, input.fuelLine.pricePerGallon)
    : 0
  const services = input.serviceLines.reduce(
    (sum, line) => sum + lineAmount(line.quantity, line.unitPrice),
    0
  )
  return Math.round((fuel + services) * 100) / 100
}

/**
 * Creates the whole ticket. Supabase-js has no client transactions, so the
 * order minimizes orphans (fueling event → invoice → lines → readings) and
 * failures after the invoice insert roll it back best-effort via delete
 * (line items and readings cascade).
 */
export async function createInvoice(
  db: SupabaseClient<Database>,
  input: NewInvoiceInput
): Promise<InvoiceWithItems> {
  const { header, fuelLine, serviceLines } = input
  const { status, paidAt } = statusFor(input)

  // 1. The fueling event (truck-sheets tables) — the single record of the
  //    real-world fuel delivery.
  let meterReadingId: number | null = null
  let createdFuelingId: number | null = null
  let fuelTransactionId: number | null = fuelLine?.fuelTransactionId ?? null
  if (fuelLine) {
    if (fuelLine.replaceFuelingReadingId != null) {
      await deleteFuelingEvent(db, fuelLine.replaceFuelingReadingId)
    }
    if (fuelLine.truckMeterReadingId != null) {
      meterReadingId = fuelLine.truckMeterReadingId
      // Billing a scanned sheet row that has already been reconciled with a
      // dispatch record: the invoice line bills that transaction unless the
      // caller explicitly chose one.
      if (fuelTransactionId == null) {
        const { data: linked, error: linkedError } = await db
          .from('truck_meter_readings')
          .select('fuel_transaction_id')
          .eq('id', meterReadingId)
          .single()
        if (linkedError) throw linkedError
        fuelTransactionId = linked.fuel_transaction_id
      }
    } else if (fuelLine.newFueling) {
      const reading = await recordFuelingEvent(db, {
        fuelTruckId: fuelLine.newFueling.fuelTruckId,
        truckNumber: fuelLine.newFueling.truckNumber,
        date: header.invoiceDate,
        sheetFuelType: toSheetFuelType(fuelLine.fuelType),
        reading: {
          customer: header.customerName,
          tail_number: header.tailNumber,
          aircraft_type: header.aircraftType,
          meter_start: fuelLine.newFueling.meterStart,
          meter_end: fuelLine.newFueling.meterStop,
          gallons_pumped: fuelLine.quantityGallons,
          req_gals_or_lbs: fuelLine.requestedAmount,
          line_tech_initials: header.salesmanInitials,
          invoice_number: header.invoiceNumber,
          service_time: fuelLine.serviceTime,
          flight_id: header.flightId
        }
      })
      meterReadingId = reading.id
      createdFuelingId = reading.id
    }
  }

  const rollbackFueling = async () => {
    if (createdFuelingId != null) {
      await db.from('truck_meter_readings').delete().eq('id', createdFuelingId)
    }
  }

  // 2. The invoice document
  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .insert({
      invoice_number: header.invoiceNumber,
      invoice_date: header.invoiceDate,
      status,
      customer_id: header.customerId,
      customer_name: header.customerName,
      station: header.station,
      tail_number: header.tailNumber,
      aircraft_type: header.aircraftType,
      flight_id: header.flightId,
      payment_method: header.paymentMethod,
      check_number:
        header.paymentMethod === 'check' ? header.checkNumber : null,
      paid_at: paidAt,
      salesman_initials: header.salesmanInitials,
      total: invoiceTotal(input),
      notes: header.notes,
      number_source:
        header.numberSource ?? inferNumberSource(header.invoiceNumber)
    })
    .select('id')
    .single()
  if (invoiceError) {
    await rollbackFueling()
    throw invoiceError
  }

  const rollbackAll = async () => {
    await db.from('invoices').delete().eq('id', invoice.id)
    await rollbackFueling()
  }

  try {
    // 3. Line items
    let lineNumber = 1
    let fuelLineItemId: number | null = null

    if (fuelLine) {
      const { data: fuelItem, error: fuelItemError } = await db
        .from('invoice_line_items')
        .insert({
          invoice_id: invoice.id,
          line_number: lineNumber++,
          item_type: 'fuel',
          truck_meter_reading_id: meterReadingId,
          fuel_transaction_id: fuelTransactionId,
          description: FUEL_TYPE_LABELS[fuelLine.fuelType],
          quantity: fuelLine.quantityGallons,
          unit_price: fuelLine.pricePerGallon,
          amount: lineAmount(fuelLine.quantityGallons, fuelLine.pricePerGallon),
          fuel_type: fuelLine.fuelType,
          density: fuelLine.density,
          requested_amount: fuelLine.requestedAmount,
          service_time: fuelLine.serviceTime
        })
        .select('id')
        .single()
      if (fuelItemError) {
        // Most likely uq_invoice_line_items_fuel_transaction (double-billing
        // the same fuel_transaction) or the older
        // uq_invoice_line_items_meter_reading — translated into a clear
        // message and logged to app_error_log; see lib/db-errors.ts.
        // handleWriteError always throws; the throw below is unreachable in
        // practice but keeps TS's control-flow narrowing of `fuelItem` happy.
        await handleWriteError(db, fuelItemError, {
          source: 'invoices.repo.createInvoice',
          context: {
            invoice_id: invoice.id,
            fuel_transaction_id: fuelTransactionId,
            truck_meter_reading_id: meterReadingId
          }
        })
        throw fuelItemError
      }
      fuelLineItemId = fuelItem.id
    }

    if (serviceLines.length > 0) {
      const { error: serviceError } = await db
        .from('invoice_line_items')
        .insert(
          serviceLines.map((line) => ({
            invoice_id: invoice.id,
            line_number: lineNumber++,
            item_type: line.itemType,
            product_id: line.productId,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            amount: lineAmount(line.quantity, line.unitPrice)
          }))
        )
      if (serviceError) throw serviceError
    }

    // 4. Per-position gauge readings
    const readings = (fuelLine?.readings ?? []).filter(
      (r) => r.reading_start != null && r.reading_end != null
    )
    if (fuelLineItemId != null && readings.length > 0) {
      const { error: readingsError } = await db
        .from('invoice_fuel_readings')
        .insert(
          readings.map((r) => ({
            line_item_id: fuelLineItemId,
            position: r.position,
            reading_start: r.reading_start as number,
            reading_end: r.reading_end as number
          }))
        )
      if (readingsError) throw readingsError
    }

    // 5. Billing an existing (OCR-imported) fueling event: stamp the invoice
    //    number back onto the truck-sheet row so the sheet reconciles.
    if (meterReadingId != null && createdFuelingId == null) {
      const { error: stampError } = await db
        .from('truck_meter_readings')
        .update({ invoice_number: header.invoiceNumber })
        .eq('id', meterReadingId)
      if (stampError) throw stampError
    }
  } catch (err) {
    await rollbackAll()
    throw err
  }

  const created = await getInvoiceById(db, invoice.id)
  if (!created) throw new Error('Failed to load created invoice')
  return created
}

/**
 * Deletes a draft outright (line items and gauge readings cascade). Linked
 * fueling events are unstamped, never deleted — the fuel was still pumped.
 */
export async function deleteDraftInvoice(
  db: SupabaseClient<Database>,
  invoice: InvoiceWithItems
): Promise<void> {
  if (invoice.status !== 'draft') throw new Error('Only drafts can be deleted')

  const linkedReadingIds = invoice.line_items
    .map((li) => li.truck_meter_reading_id)
    .filter((id): id is number => id != null)
  if (linkedReadingIds.length > 0) {
    const { error: unstampError } = await db
      .from('truck_meter_readings')
      .update({ invoice_number: null })
      .in('id', linkedReadingIds)
    if (unstampError) throw unstampError
  }

  const { error } = await db
    .from('invoices')
    .delete()
    .eq('id', invoice.id)
    .eq('status', 'draft')
  if (error) throw error
}

/**
 * Saving over a draft = delete + recreate. The caller decides how the fuel
 * line carries over (kept link, replaceFuelingReadingId, or fresh entry).
 */
export async function replaceDraftInvoice(
  db: SupabaseClient<Database>,
  draft: InvoiceWithItems,
  input: NewInvoiceInput
): Promise<InvoiceWithItems> {
  await deleteDraftInvoice(db, draft)
  return createInvoice(db, input)
}

/** Settles an on-account (E.O.M. / R.O.A.) invoice when payment arrives. */
export async function settleInvoice(
  db: SupabaseClient<Database>,
  id: number,
  settledVia: SettledVia,
  reference: string | null
): Promise<InvoiceWithItems> {
  const { error } = await db
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      settled_via: settledVia,
      settlement_reference: reference,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('status', 'open') // only settle outstanding invoices; no double-settlement
  if (error) throw error

  const updated = await getInvoiceById(db, id)
  if (!updated) throw new Error('Invoice not found after settlement')
  return updated
}

/**
 * Marks a paper-book invoice's carbon copy as collected by accounting (the
 * midday box pickup). Until this runs, the invoice reads as "pending
 * accounting pickup" — see isPendingAccountingPickup().
 */
export async function markAccountingPickedUp(
  db: SupabaseClient<Database>,
  id: number,
  pickedUpAt: string = new Date().toISOString()
): Promise<InvoiceWithItems> {
  const { error } = await db
    .from('invoices')
    .update({
      accounting_picked_up_at: pickedUpAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('number_source', 'paper_book')
  if (error) throw error

  const updated = await getInvoiceById(db, id)
  if (!updated) throw new Error('Invoice not found after pickup update')
  return updated
}

/**
 * Voids an invoice and releases its fueling event (clears the line-item
 * links — both the truck-sheet row and the dispatch record — and the
 * invoice number stamped on the truck-sheet row) so the event can be
 * rebilled on a corrected ticket. Releasing fuel_transaction_id is what
 * frees the uniqueness slot in uq_invoice_line_items_fuel_transaction.
 */
export async function voidInvoice(
  db: SupabaseClient<Database>,
  invoice: InvoiceWithItems
): Promise<void> {
  const fuelLines = invoice.line_items.filter(
    (li) => li.truck_meter_reading_id != null || li.fuel_transaction_id != null
  )

  for (const line of fuelLines) {
    if (line.truck_meter_reading_id != null) {
      const { error: unstampError } = await db
        .from('truck_meter_readings')
        .update({ invoice_number: null })
        .eq('id', line.truck_meter_reading_id)
      if (unstampError) throw unstampError
    }

    const { error: unlinkError } = await db
      .from('invoice_line_items')
      .update({ truck_meter_reading_id: null, fuel_transaction_id: null })
      .eq('id', line.id)
    if (unlinkError) throw unlinkError
  }

  const { error } = await db
    .from('invoices')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', invoice.id)
  if (error) throw error
}
