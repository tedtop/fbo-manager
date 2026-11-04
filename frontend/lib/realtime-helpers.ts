/** Trailing-edge debounce: a burst of trigger() calls runs fn once, `ms` after the last call. */
export function createDebouncer(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    trigger() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn()
      }, ms)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    }
  }
}

/**
 * Ref-counted shared resource: `acquire` runs on the first retain, its returned cleanup runs when the
 * last holder releases. Releasing twice is a no-op.
 */
export function createRefCounted(acquire: () => () => void) {
  let count = 0
  let cleanup: (() => void) | null = null
  return {
    retain() {
      if (count === 0) cleanup = acquire()
      count++
      let released = false
      return () => {
        if (released) return
        released = true
        count--
        if (count === 0 && cleanup) {
          cleanup()
          cleanup = null
        }
      }
    },
    get count() {
      return count
    }
  }
}
