'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import type { InvoiceWithItems, SettledVia } from '@/repositories/invoices.repo'
import { Banknote, CreditCard, FileCheck, Landmark } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from './ticket-math'
import { PAYMENT_METHOD_LABELS } from './types'

const OPTIONS: Array<{
  value: SettledVia
  label: string
  icon: React.ReactNode
}> = [
  { value: 'check', label: 'Check', icon: <FileCheck className="h-4 w-4" /> },
  { value: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" /> },
  {
    value: 'credit_card',
    label: 'Credit card',
    icon: <CreditCard className="h-4 w-4" />
  },
  {
    value: 'account_credit',
    label: 'Account credit',
    icon: <Landmark className="h-4 w-4" />
  }
]

interface SettleInvoiceDialogProps {
  invoice: InvoiceWithItems | null
  onOpenChange: (open: boolean) => void
  onConfirm: (
    settledVia: SettledVia,
    reference: string | null
  ) => void | Promise<void>
  settling?: boolean
}

/**
 * Closes out an E.O.M. / R.O.A. invoice once the account payment arrives —
 * a separate step from the ticket itself since the ticket's own payment
 * checkbox only records the billing intent, not the eventual settlement.
 */
export function SettleInvoiceDialog({
  invoice,
  onOpenChange,
  onConfirm,
  settling
}: SettleInvoiceDialogProps) {
  const [settledVia, setSettledVia] = useState<SettledVia>('check')
  const [reference, setReference] = useState('')

  return (
    <Sheet open={invoice != null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Settle account invoice</SheetTitle>
          <SheetDescription>
            {invoice && (
              <>
                Ticket #{invoice.invoice_number} · {invoice.customer_name} ·{' '}
                <span className="font-semibold text-foreground">
                  {formatCurrency(invoice.total)}
                </span>{' '}
                billed{' '}
                {invoice.payment_method
                  ? PAYMENT_METHOD_LABELS[invoice.payment_method]
                  : ''}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <RadioGroup
            value={settledVia}
            onValueChange={(v) => setSettledVia(v as SettledVia)}
            className="gap-2"
          >
            {OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`settle-${option.value}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-primary"
              >
                <RadioGroupItem
                  value={option.value}
                  id={`settle-${option.value}`}
                />
                {option.icon}
                <span className="font-medium">{option.label}</span>
              </Label>
            ))}
          </RadioGroup>

          <div className="space-y-1">
            <Label
              htmlFor="settle-reference"
              className="text-xs text-muted-foreground"
            >
              Reference (check #, confirmation, etc.)
            </Label>
            <Input
              id="settle-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            disabled={settling}
            onClick={() => onConfirm(settledVia, reference.trim() || null)}
            className="w-full sm:w-auto"
          >
            {settling ? 'Recording…' : 'Confirm settlement'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
