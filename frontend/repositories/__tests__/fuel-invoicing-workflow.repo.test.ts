import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeEquipment } from '@/tests/support/factories'
import {
  createTransaction,
  deleteTransaction,
  findMatchCandidates,
  findTankReadings,
  findUninvoicedTransactions,
  linkReadingToTransaction,
  parseGallonsRequested,
  updateTankReadings,
  unlinkReading,
} from '@/repositories/transactions.repo'
import {
  createTruckMeterReadings,
  createTruckSheet,
  type TruckMeterReadingRow,
} from '@/repositories/truck-sheets.repo'
import {
  createInvoice,
  inferNumberSource,
  isPendingAccountingPickup,
  markAccountingPickedUp,
  voidInvoice,
  type NewInvoiceInput,
} from '@/repositories/invoices.repo'
import {
  deleteScannedDocument,
  findScansForTruckSheet,
  findUnlinkedScans,
  getScanSignedUrl,
  linkScanToTruckSheet,
  uploadScannedDocument,
} from '@/repositories/scanned-documents.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

const TODAY = new Date().toISOString().slice(0, 10)

async function makeSheetWithReading(
  overrides: Partial<Parameters<typeof createTruckMeterReadings>[1][number]> = {}
): Promise<{ sheetId: number; reading: TruckMeterReadingRow }> {
  const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
  const sheet = await createTruckSheet(db, {
    sheet_date: TODAY,
    fuel_truck_id: truck.id,
    truck_number: '5282',
    fuel_type: 'jet_a',
    starting_gallons: 5000,
  })
  const [reading] = await createTruckMeterReadings(db, [
    {
      truck_sheet_id: sheet.id,
      line_number: 1,
      reading_type: 'fueling',
      customer: 'Life Flight',
      tail_number: 'N116FE',
      meter_start: 108413.4,
      meter_end: 108447.6,
      gallons_pumped: 34.2,
      ...overrides,
    },
  ])
  return { sheetId: sheet.id, reading }
}

function invoiceInput(overrides: Partial<NewInvoiceInput['header']> = {}): NewInvoiceInput {
  return {
    header: {
      invoiceNumber: `26-${Math.floor(Math.random() * 10_000)}`,
      invoiceDate: TODAY,
      customerId: null,
      customerName: 'Life Flight',
      station: null,
      tailNumber: 'N116FE',
      aircraftType: null,
      flightId: null,
      paymentMethod: 'cash',
      checkNumber: null,
      salesmanInitials: 'TT',
      notes: null,
      ...overrides,
    },
    fuelLine: null,
    serviceLines: [],
    finalize: true,
  }
}

describe('parseGallonsRequested', () => {
  it('parses plain and decorated gallon requests', () => {
    expect(parseGallonsRequested('300')).toBe(300)
    expect(parseGallonsRequested('1,249')).toBe(1249)
    expect(parseGallonsRequested('110/s Jet A+')).toBe(110)
  })

  it('returns null for anything that is not clearly gallons', () => {
    expect(parseGallonsRequested('T/O')).toBeNull()
    expect(parseGallonsRequested('Fill')).toBeNull()
    expect(parseGallonsRequested('2700 lbs')).toBeNull()
    expect(parseGallonsRequested('2700lbs')).toBeNull()
    expect(parseGallonsRequested(null)).toBeNull()
    expect(parseGallonsRequested('')).toBeNull()
  })
})

describe('dispatch ↔ truck-sheet reconciliation', () => {
  it('accepts the radioed-in minimum: no meter numbers at creation', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'RADIO-1',
      tail_number: 'N116FE',
      customer_name: 'Life Flight',
      fuel_request: 'T/O',
      gallons_delivered: 34.2,
    })
    expect(tx.fuel_request).toBe('T/O')
    expect(tx.gallons_requested).toBeNull()
    expect(Number(tx.gallons_delivered)).toBeCloseTo(34.2)
  })

  it('finds match candidates by tail number around the sheet date', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'MATCH-1',
      tail_number: 'N116FE',
    })
    await createTransaction(db, { ticket_number: 'OTHER', tail_number: 'N999ZZ' })

    const candidates = await findMatchCandidates(db, {
      tailNumber: 'n116fe', // case-insensitive
      sheetDate: TODAY,
    })
    expect(candidates.map((c) => c.id)).toEqual([tx.id])
    expect(candidates[0].truck_meter_readings).toEqual([])
  })

  it('returns no candidates without a tail number to match on', async () => {
    await createTransaction(db, { ticket_number: 'X', tail_number: 'N116FE' })
    expect(await findMatchCandidates(db, { tailNumber: null, sheetDate: TODAY })).toEqual([])
    expect(await findMatchCandidates(db, { tailNumber: '  ', sheetDate: TODAY })).toEqual([])
  })

  it('links a scanned reading to its transaction and backfills gallons_delivered', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'LINK-1',
      tail_number: 'N116FE',
      fuel_request: 'T/O', // no gallons radioed in
    })
    const { reading } = await makeSheetWithReading()

    await linkReadingToTransaction(db, reading.id, tx.id)

    const { data: linked } = await db
      .from('truck_meter_readings')
      .select('fuel_transaction_id')
      .eq('id', reading.id)
      .single()
    expect(linked?.fuel_transaction_id).toBe(tx.id)

    const { data: refreshed } = await db
      .from('fuel_transaction')
      .select('gallons_delivered')
      .eq('id', tx.id)
      .single()
    expect(Number(refreshed?.gallons_delivered)).toBeCloseTo(34.2)
  })

  it('does not overwrite gallons_delivered that dispatch already had', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'LINK-2',
      tail_number: 'N116FE',
      gallons_delivered: 35,
    })
    const { reading } = await makeSheetWithReading()

    await linkReadingToTransaction(db, reading.id, tx.id)

    const { data: refreshed } = await db
      .from('fuel_transaction')
      .select('gallons_delivered')
      .eq('id', tx.id)
      .single()
    expect(Number(refreshed?.gallons_delivered)).toBe(35)
  })

  it('allows one transaction to span multiple sheet rows (front + rear register)', async () => {
    const tx = await createTransaction(db, { ticket_number: 'DUAL', tail_number: 'N116FE' })
    const { sheetId, reading: front } = await makeSheetWithReading({ meter: 'front' })
    const [rear] = await createTruckMeterReadings(db, [
      {
        truck_sheet_id: sheetId,
        line_number: 2,
        reading_type: 'fueling',
        tail_number: 'N116FE',
        meter: 'rear',
        gallons_pumped: 1200,
      },
    ])

    await linkReadingToTransaction(db, front.id, tx.id)
    await linkReadingToTransaction(db, rear.id, tx.id)

    const candidates = await findMatchCandidates(db, { tailNumber: 'N116FE', sheetDate: TODAY })
    expect(candidates[0].truck_meter_readings).toHaveLength(2)

    await unlinkReading(db, front.id)
    const after = await findMatchCandidates(db, { tailNumber: 'N116FE', sheetDate: TODAY })
    expect(after[0].truck_meter_readings).toHaveLength(1)
  })
})

describe('per-tank readings (airline fuelings, fixed columns)', () => {
  it('is null until set — GA transactions never touch these columns', async () => {
    const tx = await createTransaction(db, { ticket_number: 'GA-1', tail_number: 'N1GA' })
    expect(await findTankReadings(db, tx.id)).toBeNull()
  })

  it('E175 (L/R/T): T is the totalizer, not a center tank — center stays null', async () => {
    const tx = await createTransaction(db, { ticket_number: 'E175-1', tail_number: 'N123UA' })

    await updateTankReadings(db, tx.id, {
      before_left: 3930,
      before_right: 4040,
      before_center: null,
      before_total: 7970,
      after_left: 7950,
      after_right: 7950,
      after_center: null,
      after_total: 15900,
    })

    const readings = await findTankReadings(db, tx.id)
    expect(readings).toEqual({
      before_left: 3930,
      before_right: 4040,
      before_center: null,
      before_total: 7970,
      after_left: 7950,
      after_right: 7950,
      after_center: null,
      after_total: 15900,
      unit: 'lbs',
    })
  })

  it('737 (L/C/R): center is a real tank', async () => {
    const tx = await createTransaction(db, { ticket_number: '737-1', tail_number: 'N737X' })

    await updateTankReadings(db, tx.id, {
      before_left: 5000,
      before_right: 5000,
      before_center: 0,
      before_total: null,
      after_left: 9000,
      after_right: 9000,
      after_center: 4000,
      after_total: null,
      unit: 'lbs',
    })

    const readings = await findTankReadings(db, tx.id)
    expect(readings?.before_center).toBe(0)
    expect(readings?.after_center).toBe(4000)
    expect(readings?.before_total).toBeNull()
  })

  it('can be cleared back to null (all fields null)', async () => {
    const tx = await createTransaction(db, { ticket_number: 'CLEAR-1', tail_number: 'N1CLR' })
    await updateTankReadings(db, tx.id, {
      before_left: 100,
      before_right: 100,
      before_center: null,
      before_total: null,
      after_left: 200,
      after_right: 200,
      after_center: null,
      after_total: null,
    })
    expect(await findTankReadings(db, tx.id)).not.toBeNull()

    await updateTankReadings(db, tx.id, {
      before_left: null,
      before_right: null,
      before_center: null,
      before_total: null,
      after_left: null,
      after_right: null,
      after_center: null,
      after_total: null,
    })
    expect(await findTankReadings(db, tx.id)).toBeNull()
  })
})

describe('billing a fuel_transaction', () => {
  async function billTransaction(txId: number, overrides: Partial<NewInvoiceInput['header']> = {}) {
    const input = invoiceInput(overrides)
    input.fuelLine = {
      fuelTransactionId: txId,
      fuelType: 'jet_a',
      quantityGallons: 34.2,
      pricePerGallon: 6.75,
      density: null,
      requestedAmount: null,
      serviceTime: null,
      readings: [],
    }
    return createInvoice(db, input)
  }

  it('a completed transaction is uninvoiced until billed, then leaves the queue', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'QUEUE-1',
      tail_number: 'N116FE',
      progress: 'completed',
    })
    await createTransaction(db, { ticket_number: 'STILL-OPEN', progress: 'started' })

    let queue = await findUninvoicedTransactions(db)
    expect(queue.map((t) => t.id)).toEqual([tx.id]) // only completed, unbilled

    const invoice = await billTransaction(tx.id)
    expect(invoice.line_items[0].fuel_transaction_id).toBe(tx.id)
    expect(invoice.line_items[0].fuel_transaction?.ticket_number).toBe('QUEUE-1')

    queue = await findUninvoicedTransactions(db)
    expect(queue).toEqual([])
  })

  it('refuses to bill the same fuel_transaction twice, with a friendly message, and logs it', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'ONCE',
      tail_number: 'N116FE',
      progress: 'completed',
    })
    await billTransaction(tx.id)

    await expect(billTransaction(tx.id)).rejects.toMatchObject({
      name: 'ConstraintViolationError',
      sqlCode: '23505',
      constraintName: 'uq_invoice_line_items_fuel_transaction',
      message: 'This fueling has already been added to another invoice.',
    })

    const { data: logRows } = await db
      .from('app_error_log')
      .select('*')
      .eq('category', 'db_constraint')
    expect(logRows).toHaveLength(1)
    expect(logRows?.[0]).toMatchObject({
      error_code: 'uq_invoice_line_items_fuel_transaction',
      message: 'This fueling has already been added to another invoice.',
      source: 'invoices.repo.createInvoice',
    })
    expect(logRows?.[0].context).toMatchObject({ fuel_transaction_id: tx.id })
    expect(logRows?.[0].detail).toContain('23505')
  })

  it('voiding the invoice releases the transaction for rebilling', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'REBILL',
      tail_number: 'N116FE',
      progress: 'completed',
    })
    const invoice = await billTransaction(tx.id)

    await voidInvoice(db, invoice)
    const rebilled = await billTransaction(tx.id, {
      invoiceNumber: `26-${Math.floor(Math.random() * 10_000)}`,
    })
    expect(rebilled.line_items[0].fuel_transaction_id).toBe(tx.id)
  })

  it('blocks deleting a billed transaction with a friendly message, and logs it', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'RESTRICT',
      tail_number: 'N116FE',
      progress: 'completed',
    })
    const invoice = await billTransaction(tx.id)

    await expect(deleteTransaction(db, tx.id)).rejects.toMatchObject({
      name: 'ConstraintViolationError',
      sqlCode: '23503',
      constraintName: 'invoice_line_items_fuel_transaction_id_fkey',
      message:
        'This fueling has already been billed to an invoice — void the invoice before deleting it.',
    })

    const { data: logRows } = await db
      .from('app_error_log')
      .select('*')
      .eq('source', 'transactions.repo.deleteTransaction')
    expect(logRows).toHaveLength(1)
    expect(logRows?.[0].context).toMatchObject({ fuel_transaction_id: tx.id })

    await voidInvoice(db, invoice)
    await deleteTransaction(db, tx.id) // now allowed
  })

  it('billing a reconciled sheet row inherits its linked transaction', async () => {
    const tx = await createTransaction(db, {
      ticket_number: 'INHERIT',
      tail_number: 'N116FE',
      progress: 'completed',
    })
    const { reading } = await makeSheetWithReading()
    await linkReadingToTransaction(db, reading.id, tx.id)

    const input = invoiceInput()
    input.fuelLine = {
      truckMeterReadingId: reading.id,
      fuelType: 'jet_a',
      quantityGallons: 34.2,
      pricePerGallon: 6.75,
      density: null,
      requestedAmount: null,
      serviceTime: null,
      readings: [],
    }
    const invoice = await createInvoice(db, input)
    expect(invoice.line_items[0].fuel_transaction_id).toBe(tx.id)
    expect(invoice.line_items[0].truck_meter_reading_id).toBe(reading.id)
  })
})

describe('invoice-number regimes', () => {
  it('classifies dash numbers as live and 5-digit book serials as paper_book', () => {
    expect(inferNumberSource('26-3330')).toBe('live')
    expect(inferNumberSource('21483')).toBe('paper_book')
    expect(inferNumberSource(' 21483 ')).toBe('paper_book')
    expect(inferNumberSource('214835')).toBe('live') // 6 digits: not a book serial
  })

  it('a paper-book invoice is pending pickup until accounting collects it', async () => {
    const invoice = await createInvoice(db, invoiceInput({
      invoiceNumber: '21483',
      paymentMethod: 'eom', // airline account billing
    }))
    expect(invoice.number_source).toBe('paper_book')
    expect(isPendingAccountingPickup(invoice)).toBe(true)

    const picked = await markAccountingPickedUp(db, invoice.id)
    expect(picked.accounting_picked_up_at).not.toBeNull()
    expect(isPendingAccountingPickup(picked)).toBe(false)
  })

  it('a live dash-format invoice is never pending pickup', async () => {
    const invoice = await createInvoice(db, invoiceInput({ invoiceNumber: '26-3330' }))
    expect(invoice.number_source).toBe('live')
    expect(isPendingAccountingPickup(invoice)).toBe(false)
  })
})

describe('scanned_documents (original scan persistence)', () => {
  function fakePhoto(contents: string): Blob {
    return new Blob([contents], { type: 'image/jpeg' })
  }

  it('uploads, lists, signs, and deletes truck-sheet scans', async () => {
    const { sheetId } = await makeSheetWithReading()

    const page1 = await uploadScannedDocument(db, {
      docType: 'truck_sheet',
      file: fakePhoto('page one'),
      filename: 'IMG_0001.jpg',
      pageNumber: 1,
      truckSheetId: sheetId,
    })
    await uploadScannedDocument(db, {
      docType: 'truck_sheet',
      file: fakePhoto('page two'),
      filename: 'IMG_0002.jpg',
      pageNumber: 2,
      truckSheetId: sheetId,
    })

    const scans = await findScansForTruckSheet(db, sheetId)
    expect(scans.map((s) => s.page_number)).toEqual([1, 2])
    expect(scans[0].doc_type).toBe('truck_sheet')
    expect(scans[0].storage_path).toMatch(/^truck_sheet\/\d{4}\/\d{2}\//)

    const url = await getScanSignedUrl(db, page1)
    expect(url).toContain(page1.storage_path.split('/').pop() as string)

    for (const scan of scans) {
      await deleteScannedDocument(db, scan)
    }
    expect(await findScansForTruckSheet(db, sheetId)).toEqual([])
  })

  it('supports scans uploaded before anyone knows what they belong to', async () => {
    const scan = await uploadScannedDocument(db, {
      docType: 'invoice_slip',
      file: fakePhoto('carbon copy 21483'),
      filename: 'slip.jpg',
    })
    expect(scan.truck_sheet_id).toBeNull()
    expect(scan.invoice_id).toBeNull()

    const unlinked = await findUnlinkedScans(db, 'invoice_slip')
    expect(unlinked.map((s) => s.id)).toEqual([scan.id])

    const { sheetId } = await makeSheetWithReading()
    await linkScanToTruckSheet(db, scan.id, sheetId, 1)
    expect(await findUnlinkedScans(db)).toEqual([])

    await deleteScannedDocument(db, scan)
  })
})
