import { describe, expect, it } from 'vitest'
import { decideSheet } from '../scan-duplicates'

const none = new Set<string>()

describe('decideSheet', () => {
  it('a fresh truck/day is a new sheet with pages numbered from 1', () => {
    const d = decideSheet({ existing: null, attach: false, hashes: ['a', 'b'], storedHashes: none })
    expect(d).toMatchObject({ mode: 'new', nextPageNumbers: [1, 2], blocked: null })
  })

  it('an existing sheet blocks until the user chooses to add pages', () => {
    const existing = { id: 7, pageCount: 2, maxPageNumber: 2 }
    expect(decideSheet({ existing, attach: false, hashes: ['c'], storedHashes: none })).toMatchObject({ mode: 'needs_choice' })
    expect(decideSheet({ existing, attach: false, hashes: ['c'], storedHashes: none }).blocked).toMatch(/already exists/)
    const d = decideSheet({ existing, attach: true, hashes: ['c'], storedHashes: none })
    expect(d).toMatchObject({ mode: 'attach', nextPageNumbers: [3], blocked: null })
  })

  it('skips pages whose hash is already stored and numbers only the rest', () => {
    const d = decideSheet({ existing: null, attach: false, hashes: ['a', 'b', 'c'], storedHashes: new Set(['b']) })
    expect(d.pages.map((p) => p.duplicate)).toEqual([false, true, false])
    expect(d.nextPageNumbers).toEqual([1, 2])
  })

  it('treats a repeated hash inside one batch as a duplicate', () => {
    const d = decideSheet({ existing: null, attach: false, hashes: ['a', 'a'], storedHashes: none })
    expect(d.pages.map((p) => p.duplicate)).toEqual([false, true])
  })

  it('blocks a sheet whose pages are all already stored', () => {
    const d = decideSheet({ existing: { id: 1, pageCount: 1, maxPageNumber: 1 }, attach: true, hashes: ['a'], storedHashes: new Set(['a']) })
    expect(d.blocked).toMatch(/already stored/)
    expect(d.nextPageNumbers).toEqual([])
  })
})
