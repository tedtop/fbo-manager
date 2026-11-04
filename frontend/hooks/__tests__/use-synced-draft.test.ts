import { describe, expect, it } from 'vitest'
import { draftValue, syncDraft, type DraftState } from '../use-synced-draft'

const start = (base: string[]): DraftState<string[]> => ({
  base,
  draft: undefined
})

describe('syncDraft / draftValue', () => {
  it('shows the source when there is no draft', () => {
    expect(draftValue(start(['fuel']), ['fuel'])).toEqual(['fuel'])
  })

  it('keeps an optimistic draft while the source is unchanged', () => {
    const state = { base: ['fuel'], draft: ['fuel', 'gpu'] }
    // A refetch returns a new array with the same content: draft survives.
    const next = syncDraft(state, ['fuel'])
    expect(next).toBe(state)
    expect(draftValue(next, ['fuel'])).toEqual(['fuel', 'gpu'])
  })

  it('drops the draft when the source changes (edit sheet save, other user)', () => {
    const state = { base: ['fuel'], draft: ['fuel', 'gpu'] }
    const next = syncDraft(state, ['hangar'])
    expect(next.draft).toBeUndefined()
    expect(next.base).toEqual(['hangar'])
    expect(draftValue(next, ['hangar'])).toEqual(['hangar'])
  })

  it('compares scalars by value', () => {
    const state = { base: 'old note', draft: 'typed' as string | undefined }
    expect(syncDraft(state, 'old note')).toBe(state)
    expect(syncDraft(state, 'new note').draft).toBeUndefined()
  })

  it('treats an empty-string draft as a real draft', () => {
    expect(draftValue({ base: 'a', draft: '' }, 'a')).toBe('')
  })
})
