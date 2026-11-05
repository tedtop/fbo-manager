// Cypress tasks for the invoicing specs. Use createE2EDbClient() from './db' (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const invoicingTasks = {
  /** Inserts a fuel-truck equipment row the ticket's "Fuel truck" select can pick. */
  async seedFuelTruck({ truckId, name }: { truckId: string; name: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('equipment').insert({ equipment_id: truckId, equipment_name: name, equipment_type: 'fuel_truck' })
    if (error) throw new Error(`seedFuelTruck: ${error.message}`)
    return null
  },

  /**
   * The invoice (with its line items) for an invoice number plus the fueling event (truck_meter_readings row) its
   * fuel line points at. Null when the invoice does not exist: the spec polls this task, so absence must not throw.
   */
  async getInvoiceByNumber(invoiceNumber: string) {
    const db = createE2EDbClient()
    const { data: invoice, error } = await db
      .from('invoices')
      .select('*, invoice_line_items(*)')
      .eq('invoice_number', invoiceNumber)
      .maybeSingle()
    if (error) throw new Error(`getInvoiceByNumber: ${error.message}`)
    if (!invoice) return null
    const readingId = (invoice.invoice_line_items as Array<{ truck_meter_reading_id: number | null }>)[0]?.truck_meter_reading_id ?? null
    let reading = null
    if (readingId !== null) {
      const { data, error: readingError } = await db.from('truck_meter_readings').select('*').eq('id', readingId).maybeSingle()
      if (readingError) throw new Error(`getInvoiceByNumber: reading: ${readingError.message}`)
      reading = data ?? null
    }
    return { invoice, reading }
  },

  /** Removes what a fuel-ticket run created: line items, invoice, fueling events, then the seeded truck. */
  async cleanInvoicing({ invoiceNumber, truckId }: { invoiceNumber: string; truckId: string }) {
    const db = createE2EDbClient()
    const { data: invoices, error: findError } = await db.from('invoices').select('id').eq('invoice_number', invoiceNumber)
    if (findError) throw new Error(`cleanInvoicing: find: ${findError.message}`)
    const ids = (invoices ?? []).map((r) => r.id)
    if (ids.length) {
      const { error: lineError } = await db.from('invoice_line_items').delete().in('invoice_id', ids)
      if (lineError) throw new Error(`cleanInvoicing: line items: ${lineError.message}`)
      const { error: invoiceError } = await db.from('invoices').delete().in('id', ids)
      if (invoiceError) throw new Error(`cleanInvoicing: invoice: ${invoiceError.message}`)
    }
    const { error: readingError } = await db.from('truck_meter_readings').delete().eq('invoice_number', invoiceNumber)
    if (readingError) throw new Error(`cleanInvoicing: readings: ${readingError.message}`)
    const { error: truckError } = await db.from('equipment').delete().eq('equipment_id', truckId)
    if (truckError) throw new Error(`cleanInvoicing: truck: ${truckError.message}`)
    return null
  },
}
