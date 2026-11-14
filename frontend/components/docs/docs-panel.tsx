'use client'

// Slide-in documentation panel (B27b). Deliberately NOT a Radix Dialog: no overlay, no focus trap, no scroll lock,
// so the page and the flight form stay usable while the docs are read. Fixed on the left; lg and up it is 420px
// wide and the page shifts (navigation-wrapper), below lg it is full width above the form with a Back button.
import { DocMarkdown } from '@/components/docs/doc-markdown'
import { Button } from '@/components/ui/button'
import { useDocs } from '@/providers/docs-provider'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

type DocsPayload = {
  module: { id: string; title: string; route: string }
  docs: { slug: string; title: string; anchors: string[]; markdown: string }[]
}

async function fetchDocs(moduleId: string): Promise<DocsPayload> {
  const res = await fetch(`/api/docs/${moduleId}`)
  if (!res.ok) throw new Error(`Could not load documentation (${res.status})`)
  return res.json()
}

export function DocsPanel() {
  const { open, moduleId, anchor, nonce, openDocs, closeDocs } = useDocs()
  const scrollRef = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  const { data, isError, error, refetch } = useQuery({
    queryKey: ['docs', moduleId],
    queryFn: () => fetchDocs(moduleId as string),
    enabled: moduleId !== null,
    staleTime: Number.POSITIVE_INFINITY
  })

  // Remember what opened the panel so closing can hand focus back to it.
  useEffect(() => {
    if (open && !wasOpen.current) {
      const el = document.activeElement
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null
    }
    if (!open && wasOpen.current) {
      const panel = scrollRef.current?.closest('[data-docs-panel]')
      const focusInside = panel?.contains(document.activeElement) || document.activeElement === document.body
      if (focusInside && opener.current?.isConnected) opener.current.focus()
      opener.current = null
    }
    wasOpen.current = open
  }, [open])

  // Scroll the panel (not the page) to the requested heading and flash it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce re-runs the scroll for a repeated request
  useEffect(() => {
    const root = scrollRef.current
    if (!open || !data || !root) return
    if (!anchor) {
      root.scrollTo({ top: 0 })
      return
    }
    const target = root.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`)
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    target.classList.remove('docs-highlight')
    void target.offsetWidth // restart the animation when the same heading is requested twice
    target.classList.add('docs-highlight')
    const t = window.setTimeout(() => target.classList.remove('docs-highlight'), 2000)
    return () => window.clearTimeout(t)
  }, [open, data, anchor, nonce])

  return (
    // <aside> already exposes the complementary landmark role.
    <aside
      aria-label="Documentation"
      data-docs-panel
      aria-hidden={!open}
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          closeDocs()
        }
      }}
      className={`fixed inset-y-0 left-0 z-[60] flex w-full flex-col border-r border-border bg-background shadow-lg motion-safe:transition-transform motion-safe:duration-300 lg:z-40 lg:w-[420px] ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <header className="flex items-center gap-2 border-b border-border p-3">
        <Button type="button" variant="ghost" size="sm" onClick={closeDocs} className="lg:hidden" data-testid="docs-back">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{data?.module.title ?? 'Documentation'}</div>
          {data && (
            <Link href={data.module.route} className="text-xs text-primary underline" onClick={() => closeOnSmall(closeDocs)}>
              Open module
            </Link>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={closeDocs}
          aria-label="Close documentation"
          data-testid="docs-close"
          className="max-lg:hidden"
        >
          <X className="size-4" />
        </Button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" data-testid="docs-scroll">
        {isError && (
          <div className="space-y-2 text-sm">
            <p>{error instanceof Error ? error.message : 'Could not load documentation.'}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}
        {!data && !isError && moduleId && <p className="text-sm text-muted-foreground">Loading...</p>}
        {data?.docs.map((doc) => (
          <article key={doc.slug} className="mb-10">
            <h1 className="mb-4 text-xl font-semibold">{doc.title}</h1>
            <DocMarkdown
              body={doc.markdown}
              onDocLink={(m, a) => openDocs(m, a)}
              onModuleLink={() => closeOnSmall(closeDocs)}
            />
          </article>
        ))}
      </div>
    </aside>
  )
}

// On lg and up the page shifts and stays usable beside the panel; below lg the panel covers it, so follow the link.
function closeOnSmall(closeDocs: () => void) {
  if (window.matchMedia('(max-width: 1023px)').matches) closeDocs()
}
