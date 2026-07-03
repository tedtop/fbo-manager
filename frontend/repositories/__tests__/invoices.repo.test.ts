import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { makeCustomer, makeEquipment, makeProduct } from '@/tests/support/factories'
import {
  createInvoice,
  deleteDraftInvoice,
  findInvoices,
  getInvoiceById,
  invoiceTotal,
  settleInvoice,
  suggestNextInvoiceNumber,
  voidInvoice,
  type NewInvoiceInput,
} from '@/repositories/invoices.repo'

const db = createTestClient()

beforeEach(async () => {
  await resetDatabase(db)
})

function baseInput(overrides: Partial<NewInvoiceInput['header']> = {}): NewInvoiceInput {
  return {
    header: {
      invoiceNumber: `INV-${Math.floor(Math.random() * 1_000_000)}`,
      invoiceDate: '2026-07-03',
      customerId: null,
      customerName: 'Walk-up Customer',
      station: null,
      tailNumber: 'N123AB',
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

describe('invoices.repo', () => {
  it('returns null for a nonexistent invoice id', async () => {
    expect(await getInvoiceById(db, 999_999)).toBeNull()
  })

  it('creates an invoice with a digitally-entered fuel line, persisting the fueling event too', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const input = baseInput()
    input.fuelLine = {
      newFueling: { fuelTruckId: truck.id, truckNumber: 'T-1', meterStart: 100, meterStop: 300 },
      fuelType: 'jet_a',
      quantityGallons: 200,
      pricePerGallon: 5.5,
      density: null,
      requestedAmount: null,
      serviceTime: null,
      readings: [],
    }

    const invoice = await createInvoice(db, input)

    expect(invoice.status).toBe('paid') // finalize + cash => paid
    expect(invoice.line_items).toHaveLength(1)
    expect(invoice.line_items[0].item_type).toBe('fuel')
    expect(invoice.line_items[0].meter_reading).not.toBeNull()
    expect(Number(invoice.total)).toBeCloseTo(200 * 5.5)

    // the fueling event itself is a real, independently-queryable truck_meter_readings row
    const readingId = invoice.line_items[0].truck_meter_reading_id
    expect(readingId).not.toBeNull()
    const { data: reading } = await db
      .from('truck_meter_readings')
      .select('*')
      .eq('id', readingId as number)
      .single()
    expect(reading?.gallons_pumped).toBe(200)
  })

  it('creates a draft invoice with only service lines (no fuel), leaving status=draft', async () => {
    const product = await makeProduct(db, { name: 'Lavatory Service', product_type: 'service' })
    const input = baseInput()
    input.finalize = false
    input.serviceLines = [
      { itemType: 'service', productId: product.id, description: 'Lav Service', quantity: 1, unitPrice: 75 },
    ]

    const invoice = await createInvoice(db, input)
    expect(invoice.status).toBe('draft')
    expect(invoice.line_items).toHaveLength(1)
    expect(Number(invoice.total)).toBe(75)
  })

  it('on-account payment methods (eom/roa) finalize to status=open, not paid', async () => {
    const input = baseInput({ paymentMethod: 'eom' })
    const invoice = await createInvoice(db, input)
    expect(invoice.status).toBe('open')
    expect(invoice.paid_at).toBeNull()
  })

  it('joins the customer record when customerId is set', async () => {
    const customer = await makeCustomer(db, { name: 'Regular Charter Co' })
    const input = baseInput({ customerId: customer.id, customerName: customer.name })
    const invoice = await createInvoice(db, input)
    expect(invoice.customer?.name).toBe('Regular Charter Co')
  })

  it('findInvoices filters by status', async () => {
    const draft = await createInvoice(db, { ...baseInput(), finalize: false })
    await createInvoice(db, baseInput())

    const drafts = await findInvoices(db, { status: 'draft' })
    expect(drafts.map((i) => i.id)).toEqual([draft.id])
  })

  it('findInvoices searches by invoice_number, customer_name, or tail_number', async () => {
    const invoice = await createInvoice(db, baseInput({ tailNumber: 'N777ZZ' }))
    await createInvoice(db, baseInput({ tailNumber: 'N000AA' }))

    const results = await findInvoices(db, { search: 'N777ZZ' })
    expect(results.map((i) => i.id)).toEqual([invoice.id])
  })

  it('suggestNextInvoiceNumber returns highest all-digit number + 1', async () => {
    await createInvoice(db, baseInput({ invoiceNumber: '1042' }))
    await createInvoice(db, baseInput({ invoiceNumber: 'NOT-NUMERIC' }))

    expect(await suggestNextInvoiceNumber(db)).toBe('1043')
  })

  it('deleteDraftInvoice removes a draft and unstamps its linked fueling event', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const input = baseInput()
    input.finalize = false
    input.fuelLine = {
      newFueling: { fuelTruckId: truck.id, truckNumber: 'T-2', meterStart: 0, meterStop: 50 },
      fuelType: 'jet_a',
      quantityGallons: 50,
      pricePerGallon: 5,
      density: null,
      requestedAmount: null,
      serviceTime: null,
      readings: [],
    }
    const draft = await createInvoice(db, input)

    await deleteDraftInvoice(db, draft)

    expect(await getInvoiceById(db, draft.id)).toBeNull()
    const { data: reading } = await db
      .from('truck_meter_readings')
      .select('invoice_number')
      .eq('id', draft.line_items[0].truck_meter_reading_id as number)
      .single()
    // the fuel was still pumped — only the linkage/stamp is cleared, not the reading
    expect(reading).not.toBeNull()
    expect(reading?.invoice_number).toBeNull()
  })

  it('deleteDraftInvoice refuses to delete a non-draft invoice', async () => {
    const invoice = await createInvoice(db, baseInput()) // finalize: true => paid
    await expect(deleteDraftInvoice(db, invoice)).rejects.toThrow('Only drafts can be deleted')
  })

  it('settleInvoice moves an open invoice to paid and records settlement details', async () => {
    const invoice = await createInvoice(db, baseInput({ paymentMethod: 'eom' }))
    expect(invoice.status).toBe('open')

    const settled = await settleInvoice(db, invoice.id, 'check', 'CHK-4821')
    expect(settled.status).toBe('paid')
    expect(settled.settled_via).toBe('check')
    expect(settled.settlement_reference).toBe('CHK-4821')
  })

  it('voidInvoice releases the linked fueling event and marks the invoice void', async () => {
    const truck = await makeEquipment(db, { equipment_type: 'fuel_truck' })
    const input = baseInput()
    input.fuelLine = {
      newFueling: { fuelTruckId: truck.id, truckNumber: 'T-3', meterStart: 0, meterStop: 10 },
      fuelType: 'jet_a',
      quantityGallons: 10,
      pricePerGallon: 5,
      density: null,
      requestedAmount: null,
      serviceTime: null,
      readings: [],
    }
    const invoice = await createInvoice(db, input)
    const readingId = invoice.line_items[0].truck_meter_reading_id as number

    await voidInvoice(db, invoice)

    const voided = await getInvoiceById(db, invoice.id)
    expect(voided?.status).toBe('void')
    expect(voided?.line_items[0].truck_meter_reading_id).toBeNull()

    const { data: reading } = await db
      .from('truck_meter_readings')
      .select('invoice_number')
      .eq('id', readingId)
      .single()
    expect(reading?.invoice_number).toBeNull()
  })

  it('invoiceTotal sums fuel and service line amounts, each rounded to cents first', () => {
    // fuel: 33.333 * 3 = 99.999 -> rounds to 100.00; service: 25.005 -> rounds to 25.01.
    // Each line rounds independently before the sum, so this is not the same as
    // rounding the raw sum once (100 + 25.01 = 125.01, not 125.00).
    const total = invoiceTotal({
      fuelLine: {
        fuelType: 'jet_a',
        quantityGallons: 33.333,
        pricePerGallon: 3,
        density: null,
        requestedAmount: null,
        serviceTime: null,
        readings: [],
      },
      serviceLines: [
        { itemType: 'service', productId: null, description: 'Lav', quantity: 1, unitPrice: 25.005 },
      ],
    })
    expect(total).toBe(125.01)
  })
})
