// Runs `fn` with the process timezone pinned to `tz`, then restores it (after the returned promise
// settles when `fn` is async). Date reads TZ lazily, so assigning process.env.TZ takes effect
// immediately for later Date calls.
export function withTz<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ
  const restore = () => {
    if (original === undefined) Reflect.deleteProperty(process.env, 'TZ')
    else process.env.TZ = original
  }
  process.env.TZ = tz
  let result: T
  try {
    result = fn()
  } catch (err) {
    restore()
    throw err
  }
  if (result && typeof (result as { then?: unknown }).then === 'function') {
    return (result as unknown as Promise<unknown>).finally(restore) as T
  }
  restore()
  return result
}
