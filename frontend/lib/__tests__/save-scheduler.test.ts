import { createSaveScheduler } from '@/lib/save-scheduler'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('createSaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves only the last value of a burst, after the delay', async () => {
    const save = vi.fn(async (_: number) => {})
    const scheduler = createSaveScheduler({ delayMs: 400, save })
    scheduler.schedule(1)
    await vi.advanceTimersByTimeAsync(300)
    scheduler.schedule(2)
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(2)
  })

  it('flush saves the waiting value immediately and nothing twice', async () => {
    const save = vi.fn(async (_: number) => {})
    const scheduler = createSaveScheduler({ delayMs: 400, save })
    scheduler.schedule(7)
    await scheduler.flush()
    expect(save).toHaveBeenCalledWith(7)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush with nothing waiting resolves without saving', async () => {
    const save = vi.fn(async (_: number) => {})
    await createSaveScheduler({ delayMs: 400, save }).flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('never overlaps saves and always finishes with the last scheduled value', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const save = vi.fn(async (value: number) => {
      order.push(`start ${value}`)
      await new Promise<void>((resolve) => {
        release = resolve
      })
      order.push(`end ${value}`)
    })
    const scheduler = createSaveScheduler({ delayMs: 400, save })

    scheduler.schedule(1)
    await vi.advanceTimersByTimeAsync(400)
    expect(order).toEqual(['start 1'])

    // changes made while save 1 is in flight
    scheduler.schedule(2)
    scheduler.schedule(3)
    const flushed = scheduler.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1'])

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1', 'end 1', 'start 3'])
    release()
    await flushed
    expect(order).toEqual(['start 1', 'end 1', 'start 3', 'end 3'])
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('cancel drops the waiting value', async () => {
    const save = vi.fn(async (_: number) => {})
    const scheduler = createSaveScheduler({ delayMs: 400, save })
    scheduler.schedule(1)
    scheduler.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    await scheduler.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps saving after a save throws', async () => {
    const save = vi
      .fn<(value: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined)
    const scheduler = createSaveScheduler({ delayMs: 400, save })
    scheduler.schedule(1)
    await scheduler.flush()
    scheduler.schedule(2)
    await scheduler.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(2)
  })
})
