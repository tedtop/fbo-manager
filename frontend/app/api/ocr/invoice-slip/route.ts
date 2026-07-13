import Anthropic from '@anthropic-ai/sdk'
import { type NextRequest, NextResponse } from 'next/server'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from process.env

/**
 * OCR extraction for the second physical document type — the carbon-copy
 * "invoice slip" (pre-printed invoice book, e.g. "MAI — Minuteman Aviation
 * Inc"), used primarily for airline fuelings. Mirrors
 * app/api/ocr/truck-sheet/route.ts: same Claude-vision-as-classifier
 * pattern, same whole-file-as-one-document-block approach for PDFs (a
 * multi-page PDF here is treated as one slip spanning pages, not a bag of
 * unrelated pages — see docs/architecture/fuel-invoicing-workflow.md).
 */

export interface ExtractedInvoiceSlip {
  invoice_number: string // pre-printed 5-digit red serial, e.g. "21483"
  slip_date: string | null // "YYYY-MM-DD" if visible
  aircraft_no: string // tail number
  aircraft_type: string
  customer_name: string // the slip's "Name" field
  address: string
  meter_start: string // "less reading start"
  meter_stop: string // "meter reading at stop"
  gallons_delivered: string // "total gallons delivered"
  // Optional per-tank before/after readings, handwritten in the slip's
  // description area for airline fuelings only (737: L/C/R, E175: L/R/T —
  // "T" there is the totalizer, not a real center tank). Empty string when
  // not present/visible.
  tank_reading_unit: 'lbs' | 'gal' | ''
  tank_reading_before_left: string
  tank_reading_before_right: string
  tank_reading_before_center: string
  tank_reading_before_total: string
  tank_reading_after_left: string
  tank_reading_after_right: string
  tank_reading_after_center: string
  tank_reading_after_total: string
  notes: string
  raw_text?: string // for debugging
}

const EXTRACT_PROMPT = `This is a photo of a handwritten, carbon-copy FBO fuel invoice slip (a pre-printed page torn from an invoice book, used mainly to bill airlines for a single fueling). The photo may be rotated in any direction, including fully upside down — mentally reorient it before reading.

FORM LAYOUT
- A pre-printed serial invoice number, usually in RED ink, near the top or a corner — always exactly 5 digits (e.g. "21483", "21457"). This is the slip's permanent identity; extract it exactly as printed even if handwriting elsewhere is messy.
- Header fields, hand-filled: "Aircraft No." (tail number), "Aircraft Type" (e.g. B737, E175), "Date", "Name" (the customer/airline, e.g. "Life Flight", "UA 5996"), "Address".
- A meter/fuel block: a reading at the END of the fueling ("meter reading at stop"), a reading SUBTRACTED for the start ("less reading start"), and "total gallons delivered" (should equal stop minus start).
- A free-form description/remarks area sometimes holds handwritten PER-TANK before/after readings for airline fuelings — look for something like "L", "R", "C" or "T" labels each paired with a before and after number, and a unit (lbs is most common; sometimes gal). 737s have three tanks: Left, Center, Right. E175s have Left, Right, and a Total (no center tank — its "T" is a totalizer, not a third tank). Only extract these if actually present; most GA slips have none.

READING THE HANDWRITING
- A small raised/trailing digit after a meter number is TENTHS, same convention as truck sheets: "108413⁴" → 108413.4.
- Circled numbers are corrections/emphasis — prefer the circled value.
- Ignore faint mirrored/bleed-through text from the carbon copy underneath, and ignore obviously blank slips.

Return ONLY a valid JSON object — no prose before or after — in exactly this format (ALL numeric values as strings, empty string when not visible):
{
  "invoice_number": "5-digit red serial, exactly as printed",
  "slip_date": "YYYY-MM-DD or null if not clearly visible",
  "aircraft_no": "",
  "aircraft_type": "",
  "customer_name": "the Name field",
  "address": "",
  "meter_start": "",
  "meter_stop": "",
  "gallons_delivered": "",
  "tank_reading_unit": "lbs|gal or empty if no tank readings present",
  "tank_reading_before_left": "",
  "tank_reading_before_right": "",
  "tank_reading_before_center": "",
  "tank_reading_before_total": "",
  "tank_reading_after_left": "",
  "tank_reading_after_right": "",
  "tank_reading_after_center": "",
  "tank_reading_after_total": "",
  "notes": "anything unusual, else empty"
}

Rules:
- Do not invent data that isn't on the slip.
- Tail numbers: uppercase, no spaces/dashes (e.g. "N 116 FE" → "N116FE").
- Sanity-check your own numbers: gallons_delivered should equal meter_stop − meter_start; if your reading fails that check, re-read the digits before answering. Note remaining discrepancies in "notes".
- If the pre-printed serial number is not legible at all, leave invoice_number empty rather than guessing — this number is the sole link to accounting's paper-book pickup and must never be fabricated.`

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/**
 * Normalizes a raw parsed extraction payload into the well-typed shape.
 * Exported (pure, no network I/O) so it can be unit-tested independently of
 * the Claude API call — see __tests__/invoice-slip-normalize.test.ts.
 */
export function normalizeExtractedInvoiceSlip(
  parsed: Record<string, unknown>
): Omit<ExtractedInvoiceSlip, 'raw_text'> {
  const tankUnit = str(parsed.tank_reading_unit).toLowerCase()
  return {
    invoice_number: str(parsed.invoice_number),
    slip_date: parsed.slip_date ? str(parsed.slip_date) : null,
    aircraft_no: str(parsed.aircraft_no).toUpperCase().replace(/[\s-]/g, ''),
    aircraft_type: str(parsed.aircraft_type).toUpperCase(),
    customer_name: str(parsed.customer_name),
    address: str(parsed.address),
    meter_start: str(parsed.meter_start),
    meter_stop: str(parsed.meter_stop),
    gallons_delivered: str(parsed.gallons_delivered),
    tank_reading_unit:
      tankUnit === 'lbs' || tankUnit === 'gal'
        ? (tankUnit as 'lbs' | 'gal')
        : '',
    tank_reading_before_left: str(parsed.tank_reading_before_left),
    tank_reading_before_right: str(parsed.tank_reading_before_right),
    tank_reading_before_center: str(parsed.tank_reading_before_center),
    tank_reading_before_total: str(parsed.tank_reading_before_total),
    tank_reading_after_left: str(parsed.tank_reading_after_left),
    tank_reading_after_right: str(parsed.tank_reading_after_right),
    tank_reading_after_center: str(parsed.tank_reading_after_center),
    tank_reading_after_total: str(parsed.tank_reading_after_total),
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
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }]
        }
      ]
    })
  } catch (err) {
    console.error('[OCR invoice-slip] Claude API error:', err)
    return NextResponse.json(
      {
        error:
          'Extraction failed. Check ANTHROPIC_API_KEY and model availability.'
      },
      { status: 502 }
    )
  }

  const rawText =
    message.content[0]?.type === 'text' ? message.content[0].text : ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR invoice-slip] No JSON in response:', rawText)
    return NextResponse.json(
      { error: 'Could not parse extraction response', raw_text: rawText },
      { status: 502 }
    )
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in extraction response', raw_text: rawText },
      { status: 502 }
    )
  }

  const result: ExtractedInvoiceSlip = {
    ...normalizeExtractedInvoiceSlip(parsed),
    raw_text: rawText
  }

  return NextResponse.json(result)
}
