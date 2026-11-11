'use client'

import { Input } from '@/components/ui/input'
import { formatPhone, maskPhoneInput } from '@/lib/phone-mask'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (value: string) => void
}

/**
 * B107: the one phone field. Formats "(555) 555-1234" as you type, accepts digits only, tidies any pasted
 * format, and lets the field be cleared. Used in the Edit User sheet and in the Users table cell.
 */
export function PhoneInput({ value, onValueChange, ...rest }: Props) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="off"
      placeholder="(555) 555-1234"
      {...rest}
      value={value}
      onChange={(e) => onValueChange(maskPhoneInput(e.target.value, value))}
      onPaste={(e) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text')
        const el = e.currentTarget
        // A paste replaces the selection; a full number pasted over the whole field replaces it all.
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        const merged = start === 0 && end === value.length ? pasted : value.slice(0, start) + pasted + value.slice(end)
        onValueChange(formatPhone(merged))
      }}
    />
  )
}
