// Engine order for the schedule-sheet scan (see docs/PLAN.md "B45 Schedule sheet import design"):
//   1. Tesseract (free, local)  2. Google Cloud Vision, only when Tesseract's read is poor and a key is configured
//   3. Claude vision, only for unrecognised formats and only when SCHEDULE_OCR_ALLOW_CLAUDE=1.
// Pure orchestration: the engines are injected so tests need no network, no worker and no key.

import { type ParsedTotalFbo, parseTotalFboText } from './parse-total-fbo'
import type { ExtractedScheduleSheet } from './types'

export interface OcrResult {
  text: string
  confidence: number // 0-100, mean word confidence
}
export type OcrEngine = (file: File) => Promise<OcrResult>

export type SheetExtraction =
  | { ok: true; sheet: ExtractedScheduleSheet; engine: 'tesseract' | 'vision' | 'claude' }
  | { ok: false; status: number; error: string; raw_text?: string }

export interface ExtractDeps {
  tesseract: OcrEngine
  /** undefined when GOOGLE_VISION_API_KEY is not set */
  vision?: OcrEngine
  /** undefined unless SCHEDULE_OCR_ALLOW_CLAUDE=1 and an Anthropic key exists */
  claude?: (file: File) => Promise<SheetExtraction>
  log?: (msg: string, err?: unknown) => void
}

export const LOW_CONFIDENCE = 60
export const MAX_REVIEW_SHARE = 1 / 3

function isPoor(p: ParsedTotalFbo, confidence: number): boolean {
  return (
    p.rowCount === 0 ||
    confidence < LOW_CONFIDENCE ||
    p.needsReviewCount / p.rowCount > MAX_REVIEW_SHARE
  )
}

/** Higher is better: rows found, penalised by rows that need a second look. */
function quality(p: ParsedTotalFbo): number {
  return p.rowCount - p.needsReviewCount * 0.5
}

let warnedNoVision = false

export async function extractScheduleSheet(file: File, deps: ExtractDeps): Promise<SheetExtraction> {
  const log = deps.log ?? ((m, e) => console.warn(`[OCR schedule-sheet] ${m}`, e ?? ''))

  let text = ''
  let confidence = 0
  let parsed: ParsedTotalFbo | null = null
  let engine: 'tesseract' | 'vision' = 'tesseract'

  try {
    const t = await deps.tesseract(file)
    text = t.text
    confidence = t.confidence
    parsed = parseTotalFboText(t.text)
  } catch (err) {
    log('Tesseract failed', err)
  }

  if (!parsed || isPoor(parsed, confidence)) {
    if (deps.vision) {
      try {
        const v = await deps.vision(file)
        const pv = parseTotalFboText(v.text)
        if (!parsed || quality(pv) > quality(parsed) || (pv.recognised && !parsed.recognised)) {
          parsed = pv
          text = v.text
          engine = 'vision'
        }
      } catch (err) {
        log('Google Vision failed, keeping the Tesseract read', err)
      }
    } else if (!warnedNoVision) {
      warnedNoVision = true
      log('GOOGLE_VISION_API_KEY is not set: no fallback engine if Tesseract reads a sheet poorly')
    }
  }

  if (parsed?.recognised) {
    return { ok: true, sheet: { ...parsed.sheet, raw_text: text }, engine }
  }

  if (deps.claude) {
    const r = await deps.claude(file)
    return r.ok ? { ...r, engine: 'claude' } : r
  }
  if (!parsed) return { ok: false, status: 500, error: 'Text recognition failed' }
  return { ok: false, status: 422, error: 'Unrecognised sheet format', raw_text: text }
}

/** Test hook: lets each test see the "key missing" log once again. */
export function resetExtractLogState(): void {
  warnedNoVision = false
}
