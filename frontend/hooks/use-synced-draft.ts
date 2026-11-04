import { useState } from 'react'

export interface DraftState<T> {
  /** The source value the draft was started against. */
  base: T
  /** Optimistic local value; undefined means "show the source". */
  draft: T | undefined
}

const sameValue = <T>(a: T, b: T): boolean =>
  Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)

/**
 * A draft is dropped as soon as the source it was started from changes (e.g. the
 * flight was saved from the edit sheet or by someone else), so stale local edits
 * never hide fresh data.
 */
export function syncDraft<T>(
  state: DraftState<T>,
  source: T,
  isEqual: (a: T, b: T) => boolean = sameValue
): DraftState<T> {
  return isEqual(state.base, source)
    ? state
    : { base: source, draft: undefined }
}

export function draftValue<T>(state: DraftState<T>, source: T): T {
  return state.draft === undefined ? source : state.draft
}

/**
 * Local, optimistic copy of a prop. Returns [value, setDraft, resetDraft]:
 * value is the draft while one exists, otherwise the source. Changing the source
 * discards the draft.
 */
export function useSyncedDraft<T>(
  source: T,
  isEqual: (a: T, b: T) => boolean = sameValue
): [T, (next: T) => void, () => void] {
  const [state, setState] = useState<DraftState<T>>({
    base: source,
    draft: undefined
  })
  const synced = syncDraft(state, source, isEqual)
  // Adjusting state while rendering is React's supported way to reset state on a prop change.
  if (synced !== state) setState(synced)

  return [
    draftValue(synced, source),
    (next) => setState({ base: source, draft: next }),
    () => setState({ base: source, draft: undefined })
  ]
}
