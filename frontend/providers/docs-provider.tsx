'use client'

// Docs panel state (B27b). The URL is the source of truth: `?docs=<module>` plus `#<anchor>`. openDocs and
// closeDocs update the state and rewrite the URL with history.replaceState (no navigation, no scroll, other
// query params kept). Client navigation to another page drops the query, so the provider re-adds it while docs
// are open; browser back/forward (popstate) just follows whatever the URL says.
import { buildDocsUrl, parseDocsState } from '@/lib/docs/docs-url'
import { getDocModule } from '@/lib/docs/registry'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

type PanelState = { moduleId: string; anchor: string | null; nonce: number }

type DocsContextValue = {
  open: boolean
  moduleId: string | null
  anchor: string | null
  /** Bumps on every openDocs call, so asking for the same anchor again scrolls again. */
  nonce: number
  openDocs: (moduleId: string, anchor?: string) => void
  closeDocs: () => void
}

const DocsContext = createContext<DocsContextValue>({
  open: false,
  moduleId: null,
  anchor: null,
  nonce: 0,
  openDocs: () => {},
  closeDocs: () => {}
})

export function useDocs() {
  return useContext(DocsContext)
}

const isKnownModule = (id: string) => getDocModule(id) !== undefined

export function DocsProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<PanelState | null>(null)
  const panelRef = useRef(panel)
  panelRef.current = panel
  const nonceRef = useRef(0)

  const writeUrl = useCallback((moduleId: string | null, anchor: string | null) => {
    const { pathname, search } = window.location
    window.history.replaceState(window.history.state, '', buildDocsUrl(pathname, search, moduleId, anchor))
  }, [])

  const openDocs = useCallback(
    (moduleId: string, anchor?: string) => {
      if (!isKnownModule(moduleId)) return
      nonceRef.current += 1
      setPanel({ moduleId, anchor: anchor ?? null, nonce: nonceRef.current })
      writeUrl(moduleId, anchor ?? null)
    },
    [writeUrl]
  )

  const closeDocs = useCallback(() => {
    setPanel(null)
    writeUrl(null, null)
  }, [writeUrl])

  const value = useMemo<DocsContextValue>(
    () => ({
      open: panel !== null,
      moduleId: panel?.moduleId ?? null,
      anchor: panel?.anchor ?? null,
      nonce: panel?.nonce ?? 0,
      openDocs,
      closeDocs
    }),
    [panel, openDocs, closeDocs]
  )

  return (
    <DocsContext.Provider value={value}>
      {/* useSearchParams needs a Suspense boundary; the reader renders nothing. */}
      <Suspense fallback={null}>
        <DocsUrlSync panelRef={panelRef} setPanel={setPanel} nonceRef={nonceRef} writeUrl={writeUrl} />
      </Suspense>
      {children}
    </DocsContext.Provider>
  )
}

function DocsUrlSync({
  panelRef,
  setPanel,
  nonceRef,
  writeUrl
}: {
  panelRef: React.RefObject<PanelState | null>
  setPanel: (p: PanelState | null) => void
  nonceRef: React.RefObject<number>
  writeUrl: (moduleId: string | null, anchor: string | null) => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastPath = useRef(pathname)
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => {
      popped.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // URL -> state (initial load, deep links, back/forward, a different page).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs and the stable setters are read on purpose
  useEffect(() => {
    const fromUrl = parseDocsState(searchParams, window.location.hash, isKnownModule)
    const navigated = lastPath.current !== pathname
    lastPath.current = pathname
    const wasPopped = popped.current
    popped.current = false
    const current = panelRef.current
    if (!fromUrl && navigated && !wasPopped && current) {
      // Client navigation dropped the query while docs were open: keep them open.
      writeUrl(current.moduleId, current.anchor)
      return
    }
    if (!fromUrl) {
      if (current) setPanel(null)
      return
    }
    if (current && current.moduleId === fromUrl.moduleId && current.anchor === fromUrl.anchor) return
    nonceRef.current += 1
    setPanel({ moduleId: fromUrl.moduleId, anchor: fromUrl.anchor, nonce: nonceRef.current })
  }, [pathname, searchParams])

  // A hash typed or pasted by hand (no navigation happens, so searchParams does not change).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs and the stable setters are read on purpose
  useEffect(() => {
    const onHash = () => {
      const fromUrl = parseDocsState(window.location.search, window.location.hash, isKnownModule)
      if (!fromUrl) return
      nonceRef.current += 1
      setPanel({ moduleId: fromUrl.moduleId, anchor: fromUrl.anchor, nonce: nonceRef.current })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return null
}
