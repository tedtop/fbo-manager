/**
 * B107: one phone mask for the whole Users module (table cells and the Edit User sheet).
 * US numbers only. Stored and shown as "(555) 555-1234" (profiles.phone_number is free text, so this
 * keeps every value already stored readable; legacy values that are not 10 digits are left as written).
 */

/** Digits of a US number: any format in, at most 10 digits out. A leading country code 1 is dropped. */
export function phoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

/** "(555) 555-1234", built up as digits arrive: "", "(5", "(555", "(555) 5", "(555) 555-1234". */
export function formatPhone(raw: string): string {
  const d = phoneDigits(raw)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** Mask for a controlled input. Backspacing over a formatting character ")", " " or "-" removes the digit before it. */
export function maskPhoneInput(next: string, prev = ''): string {
  const nextDigits = phoneDigits(next)
  const deleting = next.length < prev.length
  if (deleting && nextDigits === phoneDigits(prev) && nextDigits.length > 0) {
    return formatPhone(nextDigits.slice(0, -1))
  }
  return formatPhone(next)
}

/** Value to store: masked when it is a full number, '' when empty. Anything else is invalid. */
export function normalizePhone(raw: string): string {
  return phoneDigits(raw).length === 10 ? formatPhone(raw) : ''
}

/** null when the value is fine to save (empty or a full 10-digit number), else the message to show. */
export function phoneError(raw: string): string | null {
  const n = phoneDigits(raw).length
  return n === 0 || n === 10 ? null : 'Enter a 10-digit phone number'
}

/** Display: masked when it is a full US number, otherwise the stored text unchanged. */
export function displayPhone(stored: string | null | undefined): string {
  const s = (stored ?? '').trim()
  const all = s.replace(/\D/g, '')
  const isUs = all.length === 10 || (all.length === 11 && all.startsWith('1'))
  return isUs ? formatPhone(s) : s
}
