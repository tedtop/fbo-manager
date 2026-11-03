/**
 * Turns a thrown value into a short, user-facing message for an error toast. Handles real Errors,
 * ConstraintViolationError (already user-safe) and plain PostgREST error objects ({ message, details }).
 */
export function describeError(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'string' && err.trim()) return err
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message, details } = err as { message: unknown; details?: unknown }
    if (typeof message === 'string' && message.trim()) {
      return typeof details === 'string' && details.trim()
        ? `${message} (${details})`
        : message
    }
  }
  return fallback
}
