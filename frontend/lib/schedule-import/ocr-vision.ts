// Engine 2: Google Cloud Vision DOCUMENT_TEXT_DETECTION over REST. Needs GOOGLE_VISION_API_KEY (Ted creates it).
import { preprocessForCloud } from './preprocess'
import type { OcrResult } from './extract-sheet'

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

interface VisionWord {
  confidence?: number
}
interface VisionResponse {
  responses?: Array<{
    error?: { message?: string }
    fullTextAnnotation?: {
      text?: string
      pages?: Array<{ blocks?: Array<{ paragraphs?: Array<{ words?: VisionWord[] }> }> }>
    }
  }>
}

export function visionConfigured(): boolean {
  return !!process.env.GOOGLE_VISION_API_KEY
}

/** Mean word confidence (0-100) of a Vision response; 100 when the response carries none. */
function meanConfidence(r: NonNullable<VisionResponse['responses']>[number]): number {
  const scores: number[] = []
  for (const page of r.fullTextAnnotation?.pages ?? [])
    for (const b of page.blocks ?? [])
      for (const p of b.paragraphs ?? [])
        for (const w of p.words ?? []) if (typeof w.confidence === 'number') scores.push(w.confidence)
  return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100 : 100
}

export async function visionOcr(file: File, fetchImpl: typeof fetch = fetch): Promise<OcrResult> {
  const key = process.env.GOOGLE_VISION_API_KEY
  if (!key) throw new Error('GOOGLE_VISION_API_KEY not configured')
  const content = (await preprocessForCloud(Buffer.from(await file.arrayBuffer()))).toString('base64')
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      requests: [
        { image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['en'] } }
      ]
    })
  })
  if (!res.ok) throw new Error(`Vision API HTTP ${res.status}`)
  const body = (await res.json()) as VisionResponse
  const first = body.responses?.[0]
  if (!first) throw new Error('Vision API returned no response')
  if (first.error) throw new Error(`Vision API error: ${first.error.message ?? 'unknown'}`)
  return { text: first.fullTextAnnotation?.text ?? '', confidence: meanConfidence(first) }
}
