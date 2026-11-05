// Engine 1: tesseract.js, server side, eng.traineddata bundled under ocr-data/ (no CDN download at runtime).
// One shared worker per process; jobs run one at a time.
import path from 'node:path'
import type { Worker } from 'tesseract.js'
import { preprocessForOcr } from './preprocess'
import type { OcrResult } from './extract-sheet'
import { parseTotalFboText } from './parse-total-fbo'

const LANG_PATH = process.env.OCR_DATA_DIR || path.join(process.cwd(), 'ocr-data')

const g = globalThis as unknown as { __tessWorker?: Promise<Worker>; __tessQueue?: Promise<unknown> }

function getWorker(): Promise<Worker> {
  if (!g.__tessWorker) {
    g.__tessWorker = (async () => {
      const { createWorker } = await import('tesseract.js')
      // OEM 1 = LSTM only. gzip:false because ocr-data holds the plain eng.traineddata; cachePath stays in the
      // bundled folder so nothing is written to (or fetched from) anywhere else.
      return createWorker('eng', 1, { langPath: LANG_PATH, cachePath: LANG_PATH, gzip: false })
    })().catch((err) => {
      g.__tessWorker = undefined
      throw err
    })
  }
  return g.__tessWorker
}

async function recognise(image: Buffer): Promise<OcrResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(image)
  return { text: data.text, confidence: data.confidence }
}

// Photos of a printout are often sideways or tilted, which Tesseract does not correct on its own. The first read is
// the straight photo; only when it is poor are other orientations tried (90/180/270, then a few degrees either side of
// the best one), stopping at the first good read. "Good" = the parser found rows, few of them doubtful, and the page
// confidence is not low. A page that is simply another format is not retried (confidence is fine, nothing to fix).
const ROTATE_RETRY_BELOW = 55
const ORIENTATIONS = [90, 180, 270]
const TILTS = [-3, 3, -6, 6]

function rate(r: OcrResult): { good: boolean; retry: boolean; score: number } {
  const p = parseTotalFboText(r.text)
  const doubtful = p.rowCount > 0 ? p.needsReviewCount / p.rowCount : 1
  const good = p.rowCount > 0 && doubtful <= 1 / 3 && r.confidence >= ROTATE_RETRY_BELOW
  return {
    good,
    retry: !good && (p.recognised || r.confidence < ROTATE_RETRY_BELOW),
    score: p.rowCount - p.needsReviewCount * 0.5 + (p.recognised ? 0.25 : 0) + r.confidence / 1000
  }
}

export async function tesseractOcr(file: File): Promise<OcrResult> {
  const run = async (): Promise<OcrResult> => {
    const bytes = Buffer.from(await file.arrayBuffer())
    let best = { angle: 0, r: await recognise(await preprocessForOcr(bytes)) }
    let bestRate = rate(best.r)
    const attempt = async (angle: number) => {
      const r = await recognise(await preprocessForOcr(bytes, angle))
      const rt = rate(r)
      if (rt.score > bestRate.score) {
        best = { angle, r }
        bestRate = rt
      }
    }
    if (bestRate.retry) {
      for (const a of ORIENTATIONS) {
        await attempt(a)
        if (bestRate.good) break
      }
    }
    if (bestRate.retry) {
      const base = best.angle
      for (const t of TILTS) {
        await attempt(base + t)
        if (bestRate.good) break
      }
    }
    return best.r
  }
  const job = (g.__tessQueue ?? Promise.resolve()).then(run, run)
  g.__tessQueue = job.catch(() => undefined)
  return job
}

/** Stops the shared worker (scripts and tests; the server keeps it for the life of the process). */
export async function closeTesseract(): Promise<void> {
  const w = g.__tessWorker
  g.__tessWorker = undefined
  if (w) await (await w).terminate()
}
