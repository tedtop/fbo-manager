'use client'

import type { ExtractedInvoiceSlip } from '@/app/api/ocr/invoice-slip/route'
import { invoiceKeys } from '@/hooks/use-invoices'
import { transactionKeys } from '@/hooks/use-transactions'
import { createClient } from '@/lib/supabase/client'
import {
  type TicketFuelType,
  createInvoice
} from '@/repositories/invoices.repo'
import { uploadScannedDocument } from '@/repositories/scanned-documents.repo'
import {
  createTransaction,
  updateTankReadings
} from '@/repositories/transactions.repo'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export type { ExtractedInvoiceSlip }
export type { TicketFuelType }

export interface ReviewInvoiceSlip extends ExtractedInvoiceSlip {
  id: string // local key for editing
  include: boolean
  /** The original photo/PDF — persisted to Storage on import. */
  file: File
  fuel_type: TicketFuelType
  /** Not printed on the slip; the line tech doesn't know pricing at the ramp. Must be filled in during review. */
  price_per_gallon: string
  customer_id: number | null
}

let localId = 0
function nextId(prefix: string): string {
  localId += 1
  return `${prefix}-${localId}`
}

export function toNumber(v: string): number | null {
  const n = Number.parseFloat(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** fuel_transaction.fuel_type only knows jet_a/jet_a_plus/avgas — invoice line items distinguish 100LL/80/unleaded separately. */
export function toTransactionFuelType(
  fuel: TicketFuelType
): 'jet_a' | 'avgas' | null {
  if (fuel === 'jet_a') return 'jet_a'
  if (fuel === 'avgas_100' || fuel === 'avgas_80') return 'avgas'
  return null
}

export function toReviewSlip(
  file: File,
  extraction: ExtractedInvoiceSlip
): ReviewInvoiceSlip {
  return {
    ...extraction,
    id: nextId('slip'),
    include: true,
    file,
    fuel_type: 'jet_a',
    price_per_gallon: '',
    customer_id: null
  }
}

export function useInvoiceSlipExtract() {
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractedInvoiceSlip> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/invoice-slip', {
        method: 'POST',
        body: form
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? 'Extraction failed')
      }
      return res.json()
    }
  })
}

function hasAnyTankReading(slip: ReviewInvoiceSlip): boolean {
  return [
    slip.tank_reading_before_left,
    slip.tank_reading_before_right,
    slip.tank_reading_before_center,
    slip.tank_reading_before_total,
    slip.tank_reading_after_left,
    slip.tank_reading_after_right,
    slip.tank_reading_after_center,
    slip.tank_reading_after_total
  ].some((v) => v.trim() !== '')
}

export function useInvoiceSlipCommit() {
  const db = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slips: ReviewInvoiceSlip[]) => {
      const created: number[] = []

      for (const slip of slips) {
        if (!slip.invoice_number || !slip.aircraft_no || !slip.customer_name) {
          throw new Error(
            'Each slip needs the 5-digit invoice number, aircraft number, and customer name before import'
          )
        }

        // 1. The dispatch record. Invoice slips carry no truck number (unlike
        //    truck sheets), so there is nothing to reconcile against an
        //    existing fuel_truck/truck_sheet — this always creates a fresh
        //    fuel_transaction rather than going through recordFuelingEvent.
        const transaction = await createTransaction(db, {
          ticket_number: `SLIP-${slip.invoice_number}`,
          tail_number: slip.aircraft_no,
          customer_name: slip.customer_name,
          fuel_type: toTransactionFuelType(slip.fuel_type),
          gallons_delivered: toNumber(slip.gallons_delivered),
          progress: 'completed',
          source: 'manual'
        })

        if (hasAnyTankReading(slip)) {
          await updateTankReadings(db, transaction.id, {
            before_left: toNumber(slip.tank_reading_before_left),
            before_right: toNumber(slip.tank_reading_before_right),
            before_center: toNumber(slip.tank_reading_before_center),
            before_total: toNumber(slip.tank_reading_before_total),
            after_left: toNumber(slip.tank_reading_after_left),
            after_right: toNumber(slip.tank_reading_after_right),
            after_center: toNumber(slip.tank_reading_after_center),
            after_total: toNumber(slip.tank_reading_after_total),
            unit: slip.tank_reading_unit || undefined
          })
        }

        // 2. The invoice. Saved as a DRAFT — price per gallon is not on the
        //    physical slip and defaults to 0 until front desk fills it in, so
        //    this must never auto-finalize as a $0 paid invoice.
        const invoice = await createInvoice(db, {
          header: {
            invoiceNumber: slip.invoice_number,
            invoiceDate:
              slip.slip_date || new Date().toISOString().slice(0, 10),
            customerId: slip.customer_id,
            customerName: slip.customer_name,
            station: null,
            tailNumber: slip.aircraft_no,
            aircraftType: slip.aircraft_type || null,
            flightId: null,
            paymentMethod: null,
            checkNumber: null,
            salesmanInitials: null,
            notes: slip.notes || null,
            // Guaranteed by doc_type, not inferred from the number's shape —
            // every invoice-slip import IS a paper-book invoice.
            numberSource: 'paper_book'
          },
          fuelLine: {
            fuelTransactionId: transaction.id,
            fuelType: slip.fuel_type,
            quantityGallons: toNumber(slip.gallons_delivered) ?? 0,
            pricePerGallon: toNumber(slip.price_per_gallon) ?? 0,
            density: null,
            requestedAmount: null,
            serviceTime: null,
            readings: []
          },
          serviceLines: [],
          finalize: false
        })

        // 3. Persist the original scan (private 'scans' bucket), best-effort:
        //    mirrors use-truck-sheet-import.ts — a storage hiccup must not
        //    roll back a successful invoice/transaction import.
        try {
          await uploadScannedDocument(db, {
            docType: 'invoice_slip',
            file: slip.file,
            filename: slip.file.name,
            invoiceId: invoice.id
          })
        } catch (err) {
          console.error(
            `Failed to persist original scan "${slip.file.name}" for invoice ${invoice.id}:`,
            err
          )
        }

        created.push(invoice.id)
      }

      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all })
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
    }
  })
}
