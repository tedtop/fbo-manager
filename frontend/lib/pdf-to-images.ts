// Client-only: turns a PDF (e.g. an iPhone Files > Scan Documents scan) into one JPEG per page, so the OCR routes, which
// read photos only, can take it. pdfjs-dist is imported lazily so it never reaches the SSR bundle or any page that
// does not pick a PDF. Pages are rendered one at a time and the canvas is released before the next one (iOS Safari
// limits total canvas memory). No rotation: the OCR handles any orientation.

export const MAX_PDF_PAGES = 12
export const MAX_PAGE_SIDE_PX = 2600
export const JPEG_QUALITY = 0.85

export interface PdfProgress {
  /** 1-based page being prepared. */
  page: number
  total: number
  fileName: string
}

export class PdfPrepareError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfPrepareError'
  }
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name))
}

/** `scan.pdf` page 2 -> `scan-p2.jpg` */
export function pageFileName(pdfName: string, page: number): string {
  const base = pdfName.replace(/\.pdf$/i, '') || 'scan'
  return `${base}-p${page}.jpg`
}

/** Scale that brings the page's longest side to MAX_PAGE_SIDE_PX (never above 1 point = 1 px at 4x, never below tiny). */
export function renderScale(widthPt: number, heightPt: number, maxSide = MAX_PAGE_SIDE_PX): number {
  const longest = Math.max(widthPt, heightPt)
  return longest > 0 ? maxSide / longest : 1
}

/** Friendly message for a pdfjs failure (it throws PasswordException / InvalidPDFException / generic errors). */
export function pdfErrorMessage(err: unknown, fileName: string): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'PasswordException') return `${fileName} is password-protected. Unlock it or upload photos instead.`
  if (name === 'InvalidPDFException' || name === 'FormatError' || name === 'MissingPDFException')
    return `${fileName} could not be read as a PDF. Try scanning it again or upload photos instead.`
  return `Could not prepare ${fileName}. Try scanning it again or upload photos instead.`
}

export function pageCapMessage(fileName: string, total: number): string {
  return `${fileName} has ${total} pages; only the first ${MAX_PDF_PAGES} were read. Upload the rest separately.`
}

export interface PdfConversion {
  files: File[]
  /** Set when pages were left out (page cap). */
  notice: string | null
}

/**
 * Renders every page (up to MAX_PDF_PAGES) of `pdf` to a JPEG File, in page order.
 * Throws PdfPrepareError with a user-facing message.
 */
export async function pdfToImages(pdf: File, onProgress?: (p: PdfProgress) => void): Promise<PdfConversion> {
  let pdfjs: typeof import('pdfjs-dist')
  try {
    pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  } catch {
    throw new PdfPrepareError('Could not load the PDF reader. Check the connection and try again, or upload photos.')
  }

  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) })
  const files: File[] = []
  let notice: string | null = null
  try {
    const doc = await task.promise
    const total = Math.min(doc.numPages, MAX_PDF_PAGES)
    if (doc.numPages > MAX_PDF_PAGES) notice = pageCapMessage(pdf.name, doc.numPages)
    for (let n = 1; n <= total; n++) {
      onProgress?.({ page: n, total, fileName: pdf.name })
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: renderScale(base.width, base.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      try {
        await page.render({ canvas, viewport }).promise
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
        if (!blob) throw new Error('canvas export failed')
        files.push(new File([blob], pageFileName(pdf.name, n), { type: 'image/jpeg' }))
      } finally {
        page.cleanup()
        canvas.width = 0 // frees the backing store (Safari keeps it otherwise)
        canvas.height = 0
      }
    }
  } catch (err) {
    throw new PdfPrepareError(pdfErrorMessage(err, pdf.name))
  } finally {
    await task.destroy().catch(() => undefined)
  }
  return { files, notice }
}

/**
 * Photos pass through unchanged; each PDF is replaced by its page images, in the order picked.
 * `notices` collects page-cap messages. A PDF that cannot be read throws PdfPrepareError.
 */
export async function expandPdfs(
  files: File[],
  onProgress?: (p: PdfProgress) => void,
  convert: (pdf: File, onProgress?: (p: PdfProgress) => void) => Promise<PdfConversion> = pdfToImages
): Promise<{ files: File[]; notices: string[] }> {
  const out: File[] = []
  const notices: string[] = []
  for (const f of files) {
    if (!isPdfFile(f)) {
      out.push(f)
      continue
    }
    const c = await convert(f, onProgress)
    out.push(...c.files)
    if (c.notice) notices.push(c.notice)
  }
  return { files: out, notices }
}
