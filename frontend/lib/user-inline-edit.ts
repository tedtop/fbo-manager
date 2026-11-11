import { normalizeEmail } from '@/lib/email'
import { displayPhone, formatPhone, normalizePhone, phoneError } from '@/lib/phone-mask'

/** B107: the table cells that edit in place, in Tab order. */
export type InlineField = 'name' | 'email' | 'phone' | 'hire_date' | 'employee_id' | 'badge_id'
export const INLINE_FIELDS: InlineField[] = ['name', 'email', 'phone', 'hire_date', 'employee_id', 'badge_id']

/** Name is edited as two boxes, kept in one draft. */
export interface NameDraft {
  first: string
  last: string
}

export type InlineValue = string | NameDraft

/** What a saved cell turns into on the profile row (column names of `profiles`). */
export type ProfilePatch = Partial<{
  first_name: string
  last_name: string
  phone_number: string
  hire_date: string | null
  employee_id: string | null
  badge_id: string | null
}>

export type InlineResult =
  | { ok: true; patch: ProfilePatch }
  | { ok: false; error: string }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return y >= 1900 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/**
 * Validate a draft and turn it into the profile patch to save. Email is not handled here: it goes through
 * the set-real-email path (staff-email-link), never a plain profile update.
 */
export function buildInlinePatch(field: Exclude<InlineField, 'email'>, value: InlineValue): InlineResult {
  switch (field) {
    case 'name': {
      const v = value as NameDraft
      const first = v.first.trim()
      const last = v.last.trim()
      if (!first || !last) return { ok: false, error: 'First and last name are required' }
      return { ok: true, patch: { first_name: first, last_name: last } }
    }
    case 'phone': {
      const raw = value as string
      const err = phoneError(raw)
      if (err) return { ok: false, error: err }
      return { ok: true, patch: { phone_number: normalizePhone(raw) } }
    }
    case 'hire_date': {
      const s = (value as string).trim()
      if (s && !isValidIsoDate(s)) return { ok: false, error: 'Enter a valid date' }
      return { ok: true, patch: { hire_date: s || null } }
    }
    case 'employee_id':
      return { ok: true, patch: { employee_id: (value as string).trim() || null } }
    case 'badge_id':
      return { ok: true, patch: { badge_id: (value as string).trim() || null } }
  }
}

/** Email draft check (the confirm step and the API do the rest). */
export function checkInlineEmail(raw: string, currentEmail: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(raw)
  if (!email) return { ok: false, error: 'Enter a valid email address' }
  if (email === currentEmail.toLowerCase()) return { ok: false, error: 'That is already their email' }
  return { ok: true, email }
}

type CellUser = {
  first_name: string
  last_name: string
  email: string
  phone_number: string | null
  hire_date: string | null
  employee_id: string | null
  badge_id: string | null
}

/** Draft a cell starts with when it opens for editing. */
export function inlineInitial(user: CellUser, field: InlineField): InlineValue {
  switch (field) {
    case 'name':
      return { first: user.first_name, last: user.last_name }
    case 'email':
      return user.email
    case 'phone':
      return displayPhone(user.phone_number)
    case 'hire_date':
      return user.hire_date ?? ''
    case 'employee_id':
      return user.employee_id ?? ''
    case 'badge_id':
      return user.badge_id ?? ''
  }
}

/** True when Enter / blur / Tab would save nothing new (so no request is sent). */
export function isUnchanged(user: CellUser, field: InlineField, draft: InlineValue): boolean {
  const a = inlineInitial(user, field)
  if (typeof a === 'string') return a.trim() === (draft as string).trim()
  const d = draft as NameDraft
  return a.first.trim() === d.first.trim() && a.last.trim() === d.last.trim()
}

/** Text a cell shows for a draft while its save is in flight (or has failed). */
export function draftDisplay(field: InlineField, draft: InlineValue): string {
  if (field === 'name') {
    const d = draft as NameDraft
    return `${d.first.trim()} ${d.last.trim()}`.trim()
  }
  if (field === 'phone') return formatPhone(draft as string)
  return (draft as string).trim()
}
