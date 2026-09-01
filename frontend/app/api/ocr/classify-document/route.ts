import Anthropic from '@anthropic-ai/sdk'
import { type NextRequest, NextResponse } from 'next/server'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from process.env

/**
 * Classifies an uploaded scan (image or PDF) as one of the two known FBO
 * paper-document types before routing it to the matching extraction
 * endpoint — see app/api/ocr/truck-sheet/route.ts and
 * app/api/ocr/invoice-slip/route.ts.
 *
 * Judgment call (flagged in the PR): this reuses the SAME technique the
 * truck-sheet route already uses to classify each row's reading_type — a
 * single Claude vision call with no training data or separate model — rather
 * than a purpose-trained classifier. Zero new infra, proven pattern already
 * in production.
 *
 * Scope: classifies the FILE AS A WHOLE (a multi-page PDF is treated as one
 * logical document spanning pages, matching how the truck-sheet route
 * already treats a multi-page PDF as one sheet). A single PDF that
 * genuinely interleaves multiple *different* documents (e.g. some pages a
 * truck sheet, other pages an unrelated invoice slip) is not split
 * automatically here — that page-range-splitting problem is out of scope
 * for this pass and should be flagged if it turns out to be a real need.
 */

export type DocClassification = 'truck_sheet' | 'invoice_slip' | 'unrecognized'

export interface ClassifyResult {
  doc_type: DocClassification
  notes: string
}

const CLASSIFY_PROMPT = `You are sorting scanned FBO (aviation fuel services) paperwork into exactly one of two known document types, or flagging it as unrecognized. The file may be a single photo or a multi-page PDF (if multi-page, judge it as ONE document spanning those pages, and only classify as "unrecognized" — not each page separately).

TYPE "truck_sheet": a grid/table log, one row per fueling event, for ONE truck's whole shift. Look for: a title mentioning "Truck Sheet" and "Jet A" or "Avgas", header boxes for "Truck No.", "Gallons Down", front/rear meter starting numbers, and MANY handwritten rows below with columns like Customer, Tail Number, Aircraft Type, Meter Start, Meter End, Gallons Pumped, Prist, Line Tech initials, Invoice No.

TYPE "invoice_slip": a single carbon-copy invoice-book page, one per fueling, usually for one specific aircraft/customer. Look for: an invoice-book layout (often says something like "Invoice" or a company name, e.g. "Minuteman Aviation"), a PRE-PRINTED serial number (often in red ink, exactly 5 digits) in a corner, and fields like "Aircraft No.", "Aircraft Type", "Date", "Name", "Address", a meter reading at stop, "less reading start", and "total gallons delivered". Unlike a truck sheet, this is NOT a multi-row grid — it documents a single fueling.

TYPE "unrecognized": anything that is clearly neither of the above (blank page, unrelated paperwork, illegible scan, or a document you cannot confidently place in either category).

Return ONLY a valid JSON object — no prose before or after:
{
  "doc_type": "truck_sheet|invoice_slip|unrecognized",
  "notes": "one short sentence: what you saw and why, or any ambiguity (e.g. if the file looks like it mixes multiple different documents)"
}`

const VALID_TYPES: DocClassification[] = [
  'truck_sheet',
  'invoice_slip',
  'unrecognized'
]

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/**
 * Normalizes a raw parsed classification payload, defaulting anything
 * outside the known enum to 'unrecognized' rather than trusting the model's
 * exact string. Exported (pure, no network I/O) so it can be unit-tested —
 * see __tests__/classify-document-normalize.test.ts.
 */
export function normalizeClassification(parsed: {
  doc_type?: unknown
  notes?: unknown
}): ClassifyResult {
  const docType = str(parsed.doc_type) as DocClassification
  return {
    doc_type: VALID_TYPES.includes(docType) ? docType : 'unrecognized',
    notes: str(parsed.notes)
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 }
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const isPdf = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) {
    return NextResponse.json(
      { error: 'File must be an image (JPEG, PNG) or PDF' },
      { status: 400 }
    )
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // biome-ignore lint/suspicious/noExplicitAny: SDK types for document blocks
  const fileBlock: any = isPdf
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 }
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.type as
            | 'image/jpeg'
            | 'image/png'
            | 'image/webp'
            | 'image/gif',
          data: base64
        }
      }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: CLASSIFY_PROMPT }]
        }
      ]
    })
  } catch (err) {
    console.error('[OCR classify-document] Claude API error:', err)
    return NextResponse.json(
      {
        error:
          'Classification failed. Check ANTHROPIC_API_KEY and model availability.'
      },
      { status: 502 }
    )
  }

  const rawText =
    message.content[0]?.type === 'text' ? message.content[0].text : ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR classify-document] No JSON in response:', rawText)
    return NextResponse.json(
      { error: 'Could not parse classification response', raw_text: rawText },
      { status: 502 }
    )
  }

  let parsed: { doc_type?: unknown; notes?: unknown }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in classification response', raw_text: rawText },
      { status: 502 }
    )
  }

  const result: ClassifyResult = normalizeClassification(parsed)

  return NextResponse.json(result)
}
