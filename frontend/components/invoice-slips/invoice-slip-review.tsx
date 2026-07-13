'use client'

import { CustomerCombobox } from '@/components/invoicing/customer-combobox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type ReviewInvoiceSlip,
  toNumber
} from '@/hooks/use-invoice-slip-import'
import { cn } from '@/lib/utils'
import type { CustomerRow } from '@/repositories/customers.repo'
import {
  FUEL_TYPE_LABELS,
  type TicketFuelType
} from '@/repositories/invoices.repo'
import { AlertTriangle, FileText, Info, X } from 'lucide-react'
import { validateSlipMeter } from './slip-validation'

interface InvoiceSlipReviewProps {
  slip: ReviewInvoiceSlip
  customers: CustomerRow[]
  onChange: (slip: ReviewInvoiceSlip) => void
  onRemove: () => void
}

const FUEL_OPTIONS: { value: TicketFuelType; label: string }[] = Object.entries(
  FUEL_TYPE_LABELS
).map(([value, label]) => ({ value: value as TicketFuelType, label }))

function meterMathIssue(slip: ReviewInvoiceSlip): string | null {
  return validateSlipMeter({
    meter_start: toNumber(slip.meter_start),
    meter_stop: toNumber(slip.meter_stop),
    gallons_delivered: toNumber(slip.gallons_delivered)
  })
}

export function InvoiceSlipReview({
  slip,
  customers,
  onChange,
  onRemove
}: InvoiceSlipReviewProps) {
  function patch(p: Partial<ReviewInvoiceSlip>) {
    onChange({ ...slip, ...p })
  }

  const mathIssue = meterMathIssue(slip)
  const hasTankReadings = [
    slip.tank_reading_before_left,
    slip.tank_reading_before_right,
    slip.tank_reading_before_center,
    slip.tank_reading_before_total,
    slip.tank_reading_after_left,
    slip.tank_reading_after_right,
    slip.tank_reading_after_center,
    slip.tank_reading_after_total
  ].some((v) => v.trim() !== '')

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-5 h-5 text-amber-400" />
          <span className="font-semibold text-lg">
            Invoice slip {slip.invoice_number || '?'}
          </span>
          <Badge variant="secondary">Paper book</Badge>
          {!slip.invoice_number && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3" /> 5-digit serial not read —
              enter manually
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          title="Discard this slip"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Invoice # (red serial)
          </Label>
          <Input
            value={slip.invoice_number}
            onChange={(e) => patch({ invoice_number: e.target.value.trim() })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={slip.slip_date ?? ''}
            onChange={(e) => patch({ slip_date: e.target.value || null })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Aircraft No.</Label>
          <Input
            value={slip.aircraft_no}
            onChange={(e) =>
              patch({ aircraft_no: e.target.value.toUpperCase().trim() })
            }
            className="h-8 text-xs font-mono font-semibold"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Aircraft Type</Label>
          <Input
            value={slip.aircraft_type}
            onChange={(e) =>
              patch({ aircraft_type: e.target.value.toUpperCase() })
            }
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs text-muted-foreground">Fuel type</Label>
          <select
            value={slip.fuel_type}
            onChange={(e) =>
              patch({ fuel_type: e.target.value as TicketFuelType })
            }
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:border-primary"
          >
            {FUEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Name (customer / airline)
        </Label>
        <CustomerCombobox
          customers={customers}
          customerId={slip.customer_id}
          customerName={slip.customer_name}
          onChange={(customerId, customerName) =>
            patch({ customer_id: customerId, customer_name: customerName })
          }
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Address</Label>
        <Input
          value={slip.address}
          onChange={(e) => patch({ address: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Meter start (less)
          </Label>
          <Input
            value={slip.meter_start}
            onChange={(e) => patch({ meter_start: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Meter stop</Label>
          <Input
            value={slip.meter_stop}
            onChange={(e) => patch({ meter_stop: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Gallons delivered
          </Label>
          <Input
            value={slip.gallons_delivered}
            onChange={(e) => patch({ gallons_delivered: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Price / gal <span className="text-amber-400">(not on slip)</span>
          </Label>
          <Input
            value={slip.price_per_gallon}
            onChange={(e) => patch({ price_per_gallon: e.target.value })}
            placeholder="0.00"
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>

      {mathIssue && (
        <div className="flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle className="w-3 h-3" /> {mathIssue}
        </div>
      )}

      {hasTankReadings && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="w-3 h-3" /> Per-tank readings (
            {slip.tank_reading_unit || 'unit?'})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['tank_reading_before_left', 'Before L'],
                ['tank_reading_before_center', 'Before C'],
                ['tank_reading_before_right', 'Before R'],
                ['tank_reading_before_total', 'Before T'],
                ['tank_reading_after_left', 'After L'],
                ['tank_reading_after_center', 'After C'],
                ['tank_reading_after_right', 'After R'],
                ['tank_reading_after_total', 'After T']
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  value={slip[key]}
                  onChange={(e) =>
                    patch({
                      [key]: e.target.value
                    } as Partial<ReviewInvoiceSlip>)
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {slip.notes && (
        <div
          className={cn(
            'flex items-start gap-1 text-xs rounded-md p-2',
            'bg-muted/50 text-muted-foreground'
          )}
        >
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> {slip.notes}
        </div>
      )}
    </Card>
  )
}
