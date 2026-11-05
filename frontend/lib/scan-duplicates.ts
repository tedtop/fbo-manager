// Duplicate decisions for truck sheet imports (pure).

export interface ExistingSheetInfo {
  id: number
  pageCount: number
  maxPageNumber: number
  /** equipment.id of the sheet's truck (needed to link pages added to an existing sheet). */
  fuelTruckId?: number
}

export type SheetMode = 'new' | 'needs_choice' | 'attach'

export interface PageDecision {
  hash: string
  duplicate: boolean
}

export interface SheetDecision {
  /** needs_choice: a sheet for this truck and day exists and the user has not chosen yet. */
  mode: SheetMode
  pages: PageDecision[]
  /** Page numbers for the pages that will be stored, in order (duplicates get none). */
  nextPageNumbers: number[]
  /** Why the sheet cannot be imported yet, or null. */
  blocked: string | null
}

/**
 * existing: the sheet already stored for the same truck and date, if any.
 * attach: the user chose "add these pages to the existing sheet".
 * storedHashes: hashes of upright pages already stored anywhere.
 */
export function decideSheet(args: {
  existing: ExistingSheetInfo | null
  attach: boolean
  hashes: string[]
  storedHashes: ReadonlySet<string>
}): SheetDecision {
  const seen = new Set<string>()
  const pages = args.hashes.map((hash) => {
    const duplicate = args.storedHashes.has(hash) || seen.has(hash)
    seen.add(hash)
    return { hash, duplicate }
  })
  const mode: SheetMode = !args.existing ? 'new' : args.attach ? 'attach' : 'needs_choice'
  let n = args.existing ? args.existing.maxPageNumber : 0
  const nextPageNumbers = pages.filter((p) => !p.duplicate).map(() => ++n)
  let blocked: string | null = null
  if (mode === 'needs_choice') {
    blocked = 'A sheet for this truck and date already exists: add the pages to it, or cancel.'
  } else if (nextPageNumbers.length === 0) {
    blocked = 'Every page of this sheet is already stored.'
  }
  return { mode, pages, nextPageNumbers, blocked }
}
