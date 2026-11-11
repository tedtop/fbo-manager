const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trimmed, lower-cased email, or null when it is not a plausible address. Safe for client and server. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null
}
