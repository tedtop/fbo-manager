// Google Cloud Vision DOCUMENT_TEXT_DETECTION over REST, returning words with bounding polygons (server only).
// The key is read from process.env only and is never logged or included in an error message.
import sharp from 'sharp'
import type { OcrPage, OcrWord, Point } from './types'

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'
const TIMEOUT_MS = 30_000
export const MAX_LONG_SIDE = 3000

export class VisionError extends Error {
  /** HTTP status the route should answer with: 400 for a file we cannot decode, 502 for anything on Vision's side. */
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = 'VisionError'
  }
}

export function visionConfigured(): boolean {
  return !!process.env.GOOGLE_VISION_API_KEY
}

/** EXIF-rotated JPEG whose longest side is at most MAX_LONG_SIDE px (keeps the upload far under Vision's 10 MB cap). */
export async function preprocessTruckSheet(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer()
}

interface Vertex {
  x?: number
  y?: number
}
interface VisionWordJson {
  confidence?: number
  boundingBox?: { vertices?: Vertex[] }
  symbols?: Array<{ text?: string }>
}
interface VisionJson {
  responses?: Array<{
    error?: { message?: string }
    fullTextAnnotation?: {
      pages?: Array<{
        width?: number
        height?: number
        blocks?: Array<{ paragraphs?: Array<{ words?: VisionWordJson[] }> }>
      }>
    }
  }>
}

/** Pure: Vision JSON -> words. Exported for tests and for replaying cached responses. */
export function parseVisionResponse(body: unknown): OcrPage {
  const first = (body as VisionJson).responses?.[0]
  if (!first) throw new VisionError('Vision returned no response')
  if (first.error) throw new VisionError(`Vision error: ${first.error.message ?? 'unknown'}`)
  const page = first.fullTextAnnotation?.pages?.[0]
  const words: OcrWord[] = []
  for (const block of page?.blocks ?? [])
    for (const para of block.paragraphs ?? [])
      for (const w of para.words ?? []) {
        const text = (w.symbols ?? []).map((s) => s.text ?? '').join('')
        const v = w.boundingBox?.vertices
        if (!text.trim() || !v || v.length < 4) continue
        const pts = v.slice(0, 4).map((p): Point => ({ x: p.x ?? 0, y: p.y ?? 0 }))
        words.push({ text, confidence: w.confidence ?? 0, box: pts as OcrWord['box'] })
      }
  return { width: page?.width ?? 0, height: page?.height ?? 0, words }
}

/** Sends a photo to Vision (one billable unit). Throws VisionError with a message that never contains the key. */
export async function visionWords(bytes: Buffer, fetchImpl: typeof fetch = fetch): Promise<OcrPage> {
  const key = process.env.GOOGLE_VISION_API_KEY
  if (!key) throw new VisionError('GOOGLE_VISION_API_KEY not configured')
  let content: string
  try {
    content = (await preprocessTruckSheet(bytes)).toString('base64')
  } catch {
    throw new VisionError('Could not read the image file (use a JPEG or PNG photo)', 400)
  }
  let res: Response
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        requests: [
          { image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['en'] } }
        ]
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    throw new VisionError(timedOut ? 'Vision request timed out' : 'Vision request failed')
  }
  if (!res.ok) throw new VisionError(`Vision HTTP ${res.status}`)
  return parseVisionResponse(await res.json())
}
