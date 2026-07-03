'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { InvoiceWithItems } from '@/repositories/invoices.repo'
import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { formatCurrency, formatGallons, formatReadingLine } from './ticket-math'
import {
  FBO_HEADER,
  FUEL_TYPE_TICKET_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS
} from './types'

interface InvoicePdfProps {
  invoice: InvoiceWithItems
}

/**
 * Printable ticket — one page, reads like the paper form it replaces so a
 * customer or auditor can cross-check it against a photographed original.
 */
export function InvoicePdf({ invoice }: InvoicePdfProps) {
  const fuelLine = invoice.line_items.find((li) => li.item_type === 'fuel')
  const otherLines = invoice.line_items.filter((li) => li.item_type !== 'fuel')

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print-area, .invoice-print-area * { visibility: visible; }
          .invoice-print-area {
            position: absolute; left: 0; top: 0; width: 100%; padding: 24px;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <Badge
          className={STATUS_BADGE_CLASSES[invoice.status]}
          variant="outline"
        >
          {STATUS_LABELS[invoice.status]}
        </Badge>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="invoice-print-area space-y-5 rounded-lg border bg-white p-8 text-black">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-xl font-bold">{FBO_HEADER.name}</h1>
            <p className="text-sm text-gray-600">{FBO_HEADER.address}</p>
            <p className="text-sm text-gray-600">{FBO_HEADER.phone}</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold uppercase tracking-wide">
              Fuel Ticket
            </h2>
            <p className="font-mono text-sm text-gray-600">
              #{invoice.invoice_number}
            </p>
            <p className="text-sm text-gray-600">
              {format(new Date(invoice.invoice_date), 'PP')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Field label="Name" value={invoice.customer_name} />
          <Field label="Address" value={invoice.station ?? '—'} />
          <Field label="Aircraft No." value={invoice.tail_number ?? '—'} mono />
          <Field
            label="Aircraft Type"
            value={invoice.aircraft_type ?? '—'}
            mono
          />
        </div>

        {fuelLine && (
          <div className="space-y-2 rounded border p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span>
                {fuelLine.fuel_type
                  ? FUEL_TYPE_TICKET_LABELS[fuelLine.fuel_type]
                  : 'Fuel'}
              </span>
              {fuelLine.density != null && (
                <span>Density: {fuelLine.density}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Field
                label="Quantity"
                value={`${formatGallons(fuelLine.quantity)} gal`}
                mono
                emphasize
              />
              <Field
                label="Price / gal"
                value={formatCurrency(fuelLine.unit_price)}
                mono
              />
              <Field
                label="Amount"
                value={formatCurrency(fuelLine.amount)}
                mono
                emphasize
              />
              {fuelLine.requested_amount && (
                <Field
                  label="Requested"
                  value={fuelLine.requested_amount}
                  mono
                />
              )}
              {fuelLine.service_time && (
                <Field label="Time" value={fuelLine.service_time} mono />
              )}
              {fuelLine.meter_reading?.meter_start != null &&
                fuelLine.meter_reading?.meter_end != null && (
                  <Field
                    label="Truck meter"
                    value={`${fuelLine.meter_reading.meter_start} → ${fuelLine.meter_reading.meter_end}`}
                    mono
                  />
                )}
            </div>
            {fuelLine.fuel_readings.length > 0 && (
              <div className="pt-1 text-xs text-gray-600">
                <span className="font-semibold uppercase tracking-wide">
                  Readings:{' '}
                </span>
                <span className="font-mono">
                  {fuelLine.fuel_readings
                    .map((r) => formatReadingLine(r))
                    .join('  ·  ')}
                </span>
              </div>
            )}
          </div>
        )}

        {otherLines.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5">Description</th>
                <th className="py-1.5 text-right">Qty</th>
                <th className="py-1.5 text-right">Unit price</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {otherLines.map((line) => (
                <tr key={line.id} className="border-b border-gray-100">
                  <td className="py-1.5">{line.description}</td>
                  <td className="py-1.5 text-right font-mono">
                    {line.quantity}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(line.unit_price)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {formatCurrency(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-start justify-between border-t pt-3">
          <div className="text-xs text-gray-500">
            <p>Federal and state tax included in the price per gallon.</p>
            <p className="mt-1">
              Payment:{' '}
              {invoice.payment_method
                ? PAYMENT_METHOD_LABELS[invoice.payment_method]
                : '—'}
              {invoice.check_number ? ` · Check #${invoice.check_number}` : ''}
              {invoice.salesman_initials
                ? ` · Salesman: ${invoice.salesman_initials}`
                : ''}
            </p>
            {invoice.notes && <p className="mt-1 italic">{invoice.notes}</p>}
          </div>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Total
            </span>
            <p className="font-mono text-2xl font-bold">
              {formatCurrency(invoice.total)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  emphasize
}: {
  label: string
  value: string
  mono?: boolean
  emphasize?: boolean
}) {
  return (
    <div>
      <span className="block text-xs uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <span
        className={`${mono ? 'font-mono' : ''} ${emphasize ? 'text-base font-bold' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
  )
}
