// Pure URL helpers for the docs panel (B27b). The URL is the source of truth for panel state:
// `?docs=<module>` plus the hash `#<anchor>`. Nothing here touches window, so vitest covers it.

export type DocsState = { moduleId: string; anchor: string | null }

export const DOCS_PARAM = 'docs'

/**
 * URL for `pathname` with the docs panel opened at `moduleId`/`anchor` (or closed when moduleId is null).
 * Existing query params are merged, never dropped; an existing `docs` param is replaced. The hash only ever
 * carries the docs anchor, so closing clears it.
 */
export function buildDocsUrl(
  pathname: string,
  search: string | URLSearchParams,
  moduleId: string | null,
  anchor?: string | null
): string {
  const params = new URLSearchParams(typeof search === 'string' ? search : search.toString())
  if (moduleId) params.set(DOCS_PARAM, moduleId)
  else params.delete(DOCS_PARAM)
  const query = params.toString()
  const hash = moduleId && anchor ? `#${anchor}` : ''
  return `${pathname}${query ? `?${query}` : ''}${hash}`
}

/** Reads panel state from the URL; only module ids accepted by `isKnownModule` count. */
export function parseDocsState(
  search: string | URLSearchParams,
  hash: string,
  isKnownModule: (id: string) => boolean
): DocsState | null {
  const params = new URLSearchParams(typeof search === 'string' ? search : search.toString())
  const moduleId = params.get(DOCS_PARAM)
  if (!moduleId || !isKnownModule(moduleId)) return null
  let anchor: string | null = hash.replace(/^#/, '') || null
  if (anchor) {
    try {
      anchor = decodeURIComponent(anchor)
    } catch {
      anchor = null
    }
  }
  return { moduleId, anchor }
}
