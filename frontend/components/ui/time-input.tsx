'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'
import { Input } from './input'

// 24-hour time field. <input type="time"> renders in the OS/browser locale (AM/PM on a US Mac) and
// cannot be forced to 24 h, so this is a masked text input. The value contract matches the native
// input: "HH:mm" or "" for blank.

const COMPLETE = /^([01]\d|2[0-3]):([0-5]\d)$/

// Digits only (max 4) -> "HH:mm" as the user types. A first digit above 2 can only be an hour, so it
// pads ("9" -> "09"); the colon appears once there is a third digit.
function mask(raw: string): string {
  let digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length === 1 && Number(digits) > 2) digits = `0${digits}`
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

// Blur-time leniency: "9" -> 09:00, "930" -> 09:30, "0930" -> 09:30. null when it is not a real time.
function complete(draft: string): string | null {
  const digits = draft.replace(/\D/g, '')
  let candidate: string
  if (digits.length <= 2) candidate = `${digits.padStart(2, '0')}:00`
  else candidate = `${digits.slice(0, digits.length - 2).padStart(2, '0')}:${digits.slice(-2)}`
  return digits && COMPLETE.test(candidate) ? candidate : null
}

type TimeInputProps = Omit<
  React.ComponentProps<'input'>,
  'type' | 'value' | 'onChange' | 'defaultValue'
> & {
  value: string
  onChange: (value: string) => void
}

function TimeInput({
  value,
  onChange,
  onBlur,
  className,
  ...props
}: TimeInputProps) {
  const [draft, setDraft] = React.useState(value)
  // The last value this field reported (or was given); a different `value` prop is an outside change
  // (QT recompute, loading a flight) that the draft must follow.
  const synced = React.useRef(value)
  // Restored on blur when the user leaves something that is not a time ("25:99").
  const lastValid = React.useRef(value)

  React.useEffect(() => {
    if (value !== synced.current) {
      synced.current = value
      setDraft(value)
    }
    if (value) lastValid.current = value
  }, [value])

  const emit = (next: string) => {
    synced.current = next
    if (next) lastValid.current = next
    onChange(next)
  }

  const incomplete = draft !== '' && !COMPLETE.test(draft)

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:mm"
      maxLength={5}
      value={draft}
      aria-invalid={incomplete || undefined}
      className={cn('tabular-nums', className)}
      onChange={(e) => {
        const next = mask(e.target.value)
        setDraft(next)
        // Blank until the time is whole, so a half-typed time is never saved as the previous one.
        emit(COMPLETE.test(next) ? next : '')
      }}
      onBlur={(e) => {
        if (draft !== '') {
          const fixed = complete(draft) ?? lastValid.current
          setDraft(fixed)
          if (fixed !== synced.current) emit(fixed)
        }
        onBlur?.(e)
      }}
    />
  )
}

export { TimeInput }
