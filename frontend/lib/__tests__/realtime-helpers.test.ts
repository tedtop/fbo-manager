import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer, createRefCounted } from '../realtime-helpers'

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('collapses a burst into one trailing call', () => {
    const fn = vi.fn()
    const d = createDebouncer(fn, 300)
    d.trigger()
    vi.advanceTimersByTime(200)
    d.trigger()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops a pending call', () => {
    const fn = vi.fn()
    const d = createDebouncer(fn, 300)
    d.trigger()
    d.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('createRefCounted', () => {
  it('acquires once for many holders and cleans up on the last release', () => {
    const cleanup = vi.fn()
    const acquire = vi.fn(() => cleanup)
    const r = createRefCounted(acquire)
    const a = r.retain()
    const b = r.retain()
    expect(acquire).toHaveBeenCalledTimes(1)
    a()
    expect(cleanup).not.toHaveBeenCalled()
    b()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('ignores a double release and re-acquires after full release', () => {
    const cleanup = vi.fn()
    const acquire = vi.fn(() => cleanup)
    const r = createRefCounted(acquire)
    const a = r.retain()
    const b = r.retain()
    a()
    a()
    expect(r.count).toBe(1)
    b()
    r.retain()
    expect(acquire).toHaveBeenCalledTimes(2)
  })
})
