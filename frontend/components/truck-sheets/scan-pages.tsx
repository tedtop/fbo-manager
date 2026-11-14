'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { PageScan } from '@/hooks/use-truck-scans'

/** The stored (upright) page scans of one truck sheet as thumbnails in page order; click opens the page full size. */
export function ScanPages({ pages, label }: { pages: PageScan[]; label: string }) {
  const [open, setOpen] = useState<PageScan | null>(null)

  if (pages.length === 0) {
    return <p className="text-xs text-muted-foreground" data-testid="no-scans">No scan stored for this sheet.</p>
  }

  return (
    <>
      <ul className="flex gap-3 overflow-x-auto pb-1" data-testid="scan-pages">
        {pages.map((page) => (
          <li key={page.id} className="w-28 shrink-0 space-y-1">
            <button
              type="button"
              data-testid={`scan-thumb-${page.page_number}`}
              onClick={() => setOpen(page)}
              className="block w-full rounded border border-border bg-muted focus-visible:outline-2"
              aria-label={`Open page ${page.page_number} of ${label}`}
            >
              {page.thumbUrl ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL of the stored thumbnail
                <img src={page.thumbUrl} alt={`${label}, page ${page.page_number}`} loading="lazy" className="h-36 w-full object-contain" />
              ) : (
                <span className="flex h-36 items-center justify-center text-xs text-muted-foreground">Unavailable</span>
              )}
            </button>
            <div className="text-xs text-muted-foreground">Page {page.page_number}</div>
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[95dvh] w-[95vw] max-w-4xl overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {label}, page {open?.page_number}
            </DialogTitle>
            <DialogDescription>
              Upright scan.{' '}
              {open?.originalUrl && (
                <a href={open.originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  Open the original file <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </DialogDescription>
          </DialogHeader>
          {open?.url && (
            // biome-ignore lint/performance/noImgElement: signed storage URL
            <img src={open.url} alt={`${label}, page ${open.page_number}, full size`} data-testid="scan-full" className="mx-auto h-auto max-h-[80dvh] w-auto max-w-full" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
