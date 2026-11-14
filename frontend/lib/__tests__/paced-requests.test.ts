import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError, runPaced, withRateLimitRetry } from '../paced-requests'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('runPaced', () => {
  it('keeps input order even when later items finish first', async () => {
    const p = runPaced([30, 10, 20], async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return i
    }, { concurrency: 3 })
    await vi.runAllTimersAsync()
    const out = await p
    expect(out.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([0, 1, 2])
  })

  it('never exceeds the concurrency cap', async () => {
    let active = 0
    let peak = 0
    const p = runPaced(Array.from({ length: 12 }, (_, i) => i), async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 50))
      active--
    }, { concurrency: 2 })
    await vi.runAllTimersAsync()
    await p
    expect(peak).toBe(2)
  })

  it('defaults to one request at a time with a pause between requests', async () => {
    const starts: number[] = []
    const p = runPaced([1, 2, 3], async () => {
      starts.push(Date.now())
    }, { delayMs: 500 })
    await vi.runAllTimersAsync()
    await p
    expect(starts[1] - starts[0]).toBe(500)
    expect(starts[2] - starts[1]).toBe(500)
  })

  it('records a failure without stopping the remaining items', async () => {
    const out = await runPaced([1, 2, 3], async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })
    expect(out.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
  })
})

describe('withRateLimitRetry', () => {
  it('retries on 429 with doubling backoff, then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new RateLimitError('slow down'))
      .mockRejectedValueOnce(new RateLimitError('slow down'))
      .mockResolvedValueOnce('ok')
    const p = withRateLimitRetry(fn, { baseDelayMs: 1000 })
    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('honours Retry-After over the computed backoff', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new RateLimitError('slow', 7000)).mockResolvedValueOnce('ok')
    const p = withRateLimitRetry(fn, { baseDelayMs: 1000 })
    await vi.advanceTimersByTimeAsync(6999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toBe('ok')
  })

  it('gives up after maxAttempts with a clear error', async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError('slow'))
    const p = withRateLimitRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })
    const assertion = expect(p).rejects.toThrow(/still rate limited after 3 tries/)
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry other errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad file'))
    await expect(withRateLimitRetry(fn)).rejects.toThrow('bad file')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
