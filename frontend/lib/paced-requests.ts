/** Scheduling for multi-page scan uploads: a concurrency cap, a pause between requests and backoff on HTTP 429. */

export class RateLimitError extends Error {
  readonly status = 429
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message)
    this.name = 'RateLimitError'
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface RetryOptions {
  /** Total tries including the first one. */
  maxAttempts?: number
  /** Wait before the second try; doubles on each further try. A Retry-After on the error wins. */
  baseDelayMs?: number
}

/** Runs `fn`, retrying only when it throws RateLimitError. Gives up with a clear error after `maxAttempts` tries. */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4
  const baseDelayMs = opts.baseDelayMs ?? 2000
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof RateLimitError)) throw err
      if (attempt >= maxAttempts) {
        throw new Error(`The reader is still rate limited after ${maxAttempts} tries. Wait a minute, then upload the remaining pages.`)
      }
      await sleep(err.retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1))
    }
  }
}

export interface PacedOptions {
  /** Requests in flight at once. Default 1 (strictly one page at a time). */
  concurrency?: number
  /** Pause after a request finishes before the same lane starts the next one. */
  delayMs?: number
}

/** Runs `worker` over `items` with a concurrency cap and a delay between requests. Results keep input order. */
export async function runPaced<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  opts: PacedOptions = {},
): Promise<PromiseSettledResult<R>[]> {
  const lanes = Math.max(1, Math.min(opts.concurrency ?? 1, items.length))
  const delayMs = opts.delayMs ?? 0
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0

  async function lane() {
    let first = true
    while (next < items.length) {
      const i = next++
      if (!first && delayMs > 0) await sleep(delayMs)
      first = false
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: lanes }, lane))
  return results
}
