'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { PaymentMethod } from '@/repositories/invoices.repo'
import { PAYMENT_METHOD_HINTS, PAYMENT_METHOD_LABELS } from './types'

const METHODS: PaymentMethod[] = ['cash', 'eom', 'roa', 'check', 'credit_card']

interface PaymentMethodFieldProps {
  value: PaymentMethod | null
  checkNumber: string
  onChange: (method: PaymentMethod) => void
  onCheckNumberChange: (checkNumber: string) => void
  /** E.O.M. / R.O.A. need a linked account to bill against. */
  hasAccount: boolean
  disabled?: boolean
}

/**
 * The payment checkboxes row from the paper ticket, as a radio row.
 * Radix RadioGroup gives arrow-key navigation for free.
 */
export function PaymentMethodField({
  value,
  checkNumber,
  onChange,
  onCheckNumberChange,
  hasAccount,
  disabled
}: PaymentMethodFieldProps) {
  return (
    <div className="space-y-2">
      <RadioGroup
        value={value ?? ''}
        onValueChange={(v) => onChange(v as PaymentMethod)}
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
        disabled={disabled}
      >
        {METHODS.map((method) => {
          const needsAccount =
            (method === 'eom' || method === 'roa') && !hasAccount
          return (
            <Label
              key={method}
              htmlFor={`pay-${method}`}
              title={
                needsAccount
                  ? 'Link a customer account to bill on account'
                  : PAYMENT_METHOD_HINTS[method]
              }
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center transition-colors',
                'hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/10',
                needsAccount && 'opacity-50'
              )}
            >
              <RadioGroupItem
                value={method}
                id={`pay-${method}`}
                className="sr-only"
              />
              <span className="text-xs font-bold tracking-wide">
                {PAYMENT_METHOD_LABELS[method]}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {PAYMENT_METHOD_HINTS[method]}
              </span>
            </Label>
          )
        })}
      </RadioGroup>

      {value === 'check' && (
        <div className="flex items-center gap-2">
          <Label
            htmlFor="check-number"
            className="shrink-0 text-xs text-muted-foreground"
          >
            Check no.
          </Label>
          <Input
            id="check-number"
            value={checkNumber}
            onChange={(e) => onCheckNumberChange(e.target.value)}
            placeholder="1234"
            className="h-8 w-36 font-mono"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
