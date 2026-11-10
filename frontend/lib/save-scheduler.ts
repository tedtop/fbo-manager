/**
 * Debounced, serialised "save the latest value" queue. `schedule` replaces any value still
 * waiting and restarts the timer; saves never overlap, and a value scheduled while a save is
 * running is saved right after it, so the last scheduled value is always the last one saved.
 * `save` is expected to handle its own errors; a thrown error is swallowed so that one
 * failure cannot block later saves.
 */
export type SaveScheduler<T> = {
  schedule: (value: T) => void
  /** Saves the waiting value now. Resolves once nothing is waiting or running. */
  flush: () => Promise<void>
  /** Drops the waiting value (a save already running still finishes). */
  cancel: () => void
}

export function createSaveScheduler<T>({
  delayMs,
  save
}: {
  delayMs: number
  save: (value: T) => Promise<void>
}): SaveScheduler<T> {
  let waiting: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const drain = (): Promise<void> => {
    if (running) return running
    running = (async () => {
      try {
        while (waiting) {
          const { value } = waiting
          waiting = null
          try {
            await save(value)
          } catch {
            // the caller reports its own failures
          }
        }
      } finally {
        running = null
      }
    })()
    return running
  }

  return {
    schedule(value) {
      waiting = { value }
      stopTimer()
      timer = setTimeout(() => {
        timer = null
        void drain()
      }, delayMs)
    },
    flush() {
      stopTimer()
      if (waiting) return drain()
      return running ?? Promise.resolve()
    },
    cancel() {
      stopTimer()
      waiting = null
    }
  }
}
