let counter = 0

/** Unique-enough suffix for E2E fixture data — the local DB persists across runs (no
 * per-test reset, since that would blow away the seeded auth session), so test data needs
 * to not collide with previous runs the way the vitest repo suite's rows don't need to. */
export function uniqueValue(prefix: string): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}
