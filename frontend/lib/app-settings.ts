// App-wide settings (table app_setting, one row per key). This file is the single place that knows which
// keys exist, their built-in defaults and how a value is cleaned and validated; the repository and the
// Settings page both go through it.

export const TAIL_NUMBER_PREFIX_KEY = 'tail_number_prefix'

export type AppSettings = {
  /** Text pre-filled into the tail number field of the Add Flight form, e.g. "N" or "C-". "" = no prefill. */
  tailNumberPrefix: string
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tailNumberPrefix: 'N'
}

export const MAX_TAIL_PREFIX_LENGTH = 4

// Common registration prefixes, offered as one-tap choices on the Settings page.
export const TAIL_PREFIX_PRESETS: { prefix: string; label: string }[] = [
  { prefix: 'N', label: 'United States' },
  { prefix: 'C-', label: 'Canada' },
  { prefix: 'G-', label: 'United Kingdom' },
  { prefix: 'D-', label: 'Germany' },
  { prefix: 'VH-', label: 'Australia' },
  { prefix: 'F-', label: 'France' }
]

// Tail numbers are upper case everywhere in the app (the tail field upper-cases as you type).
export function normalizeTailPrefix(raw: string): string {
  return raw.trim().toUpperCase()
}

/** null when the prefix is acceptable, else a message for the Settings page. "" is allowed: no prefill. */
export function validateTailPrefix(raw: string): string | null {
  const prefix = normalizeTailPrefix(raw)
  if (prefix.length > MAX_TAIL_PREFIX_LENGTH) {
    return `Use at most ${MAX_TAIL_PREFIX_LENGTH} characters.`
  }
  if (!/^[A-Z0-9-]*$/.test(prefix)) {
    return 'Use letters, numbers and hyphens only, for example N, C-, G-.'
  }
  return null
}

// Rows are read defensively: a missing, mistyped or invalid stored value falls back to the default.
export function settingsFromRows(
  rows: { key: string; value: unknown }[]
): AppSettings {
  const settings = { ...DEFAULT_APP_SETTINGS }
  for (const row of rows) {
    if (
      row.key === TAIL_NUMBER_PREFIX_KEY &&
      typeof row.value === 'string' &&
      validateTailPrefix(row.value) === null
    ) {
      settings.tailNumberPrefix = normalizeTailPrefix(row.value)
    }
  }
  return settings
}

/** True when the tail field holds nothing the user typed: blank, or just the pre-filled prefix. */
export function isBlankTail(tail: string | undefined, prefix: string): boolean {
  const value = (tail ?? '').trim().toUpperCase()
  return value === '' || value === normalizeTailPrefix(prefix)
}
