import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from process.env

export type ExtractedReadingType =
  | 'fueling'
  | 'tank_fill'
  | 'transfer_in'
  | 'transfer_out'
  | 'other'

export interface ExtractedReading {
  reading_type: ExtractedReadingType
  customer: string
  tail_number: string
  aircraft_type: string
  fuel_type_confirmed: boolean
  meter: 'front' | 'rear' | ''
  meter_start: string
  meter_end: string
  gallons_pumped: string
  gallons_remaining: string
  prist: 'yes' | 'no' | ''
  req_gals_or_lbs: string
  line_tech_initials: string
  invoice_number: string
  service_time: string
  notes: string
}

export interface ExtractedTruckSheet {
  sheet_date: string | null // "YYYY-MM-DD" if visible
  truck_number: string // e.g. "5282"
  fuel_type: 'jet_a' | 'avgas' | ''
  gallons_down: string
  starting_gallons: string
  front_meter_start: string
  rear_meter_start: string
  fueler_initials: string
  readings: ExtractedReading[]
  raw_text?: string // for debugging
}

const EXTRACT_PROMPT = `This is a photo of a handwritten FBO fuel truck sheet (daily meter reading log for a refueling truck). The photo may be rotated in any direction, including fully upside down — mentally reorient it before reading.

FORM LAYOUT
- Title says "Jet A" or "Avgas" (fuel type).
- Header boxes: Month / Day / Year, "Truck No.", "Gallons Down", "Front meter starting number", "Rear meter starting number" (blank or dashed on trucks with one meter), and "Init".
- A shaded band above the first row holds the truck's STARTING GALLONS for the shift (e.g. "5000", "3000", "835").
- Each handwritten row has: Customer | Tail Number | Aircraft Type | a circled "YES" (fuel type confirmed) | Meter Start | Meter End | Gallons Pumped | Starting Gallons / Gals. Remaining (running inventory after the row) | Prist Yes/No (Jet A sheets only, circled) with Req Gals or Lbs | Line Tech Initials | Invoice No. & Time.
- Rows are chronological starting at the row adjacent to the shaded starting-gallons band.

READING THE HANDWRITING
- Meter values come from mechanical registers: a small raised/trailing digit is TENTHS. Example: "108413⁴" → 108413.4, "1222066¹" → 1222066.1. Same for gallons written like "34²" → 34.2.
- Circled numbers are corrections/emphasis — prefer the circled value.
- Ignore faint mirrored/bleed-through text from other pages, and ignore completely empty rows.
- "T/O" in the Req Gals column means a top-off request. Times are usually 4-digit 24h like "0545".

CLASSIFYING EACH ROW (reading_type)
- "fueling": fuel dispensed into an aircraft (has a tail number and/or aircraft type). Top-offs of aircraft ("T/O") are still "fueling".
- "tank_fill": the TRUCK was refilled from a farm storage tank — tail/customer column shows a tank id like "T1".."T5", "TS", or "tanks", req column may say "Fill"; gallons remaining jumps up to truck capacity.
- "transfer_out": fuel pushed to ANOTHER TRUCK — e.g. "Xfer to 5282" (put the other truck number in tail_number).
- "transfer_in": fuel received FROM another truck — e.g. "Xfer from 8370".
- "other": anything that fits none of the above.

METER ATTRIBUTION
- Jet A trucks have a front and a rear meter register. Compare each row's meter magnitude with the header's front/rear starting numbers to decide which register was used, and set "meter" to "front" or "rear". Avgas trucks: "front". If unsure, use "".

Return ONLY a valid JSON object — no prose before or after — in exactly this format (ALL numeric values as strings, empty string when not visible):
{
  "sheet_date": "YYYY-MM-DD or null if not clearly visible",
  "truck_number": "e.g. 5282",
  "fuel_type": "jet_a or avgas",
  "gallons_down": "",
  "starting_gallons": "",
  "front_meter_start": "",
  "rear_meter_start": "",
  "fueler_initials": "",
  "readings": [
    {
      "reading_type": "fueling|tank_fill|transfer_in|transfer_out|other",
      "customer": "",
      "tail_number": "",
      "aircraft_type": "",
      "fuel_type_confirmed": true,
      "meter": "front|rear or empty",
      "meter_start": "",
      "meter_end": "",
      "gallons_pumped": "",
      "gallons_remaining": "",
      "prist": "yes|no or empty",
      "req_gals_or_lbs": "",
      "line_tech_initials": "",
      "invoice_number": "",
      "service_time": "",
      "notes": "anything unusual about this row, else empty"
    }
  ]
}

Rules:
- Extract EVERY filled row, in order. Do not invent data that isn't on the sheet.
- Tail numbers: uppercase, no spaces/dashes (e.g. "N 116 FE" → "N116FE").
- Sanity-check your own numbers: gallons_pumped should equal meter_end − meter_start; if your reading fails that check, re-read the digits before answering. Note remaining discrepancies in "notes".`

const READING_TYPES: ExtractedReadingType[] = [
  'fueling',
  'tank_fill',
  'transfer_in',
  'transfer_out',
  'other',
]

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
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
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    })
  } catch (err) {
    console.error('[OCR truck-sheet] Claude API error:', err)
    return NextResponse.json(
      { error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' },
      { status: 502 }
    )
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR truck-sheet] No JSON in response:', rawText)
    return NextResponse.json(
      { error: 'Could not parse extraction response', raw_text: rawText },
      { status: 502 }
    )
  }

  let parsed: ExtractedTruckSheet
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in extraction response', raw_text: rawText },
      { status: 502 }
    )
  }

  const fuelType = str(parsed.fuel_type).toLowerCase().replace(/[\s-]/g, '_')
  const result: ExtractedTruckSheet = {
    sheet_date: parsed.sheet_date ? str(parsed.sheet_date) : null,
    truck_number: str(parsed.truck_number),
    fuel_type: fuelType === 'jet_a' || fuelType === 'avgas' ? (fuelType as 'jet_a' | 'avgas') : '',
    gallons_down: str(parsed.gallons_down),
    starting_gallons: str(parsed.starting_gallons),
    front_meter_start: str(parsed.front_meter_start),
    rear_meter_start: str(parsed.rear_meter_start),
    fueler_initials: str(parsed.fueler_initials).toUpperCase(),
    readings: (parsed.readings ?? []).map((r) => ({
      reading_type: READING_TYPES.includes(r.reading_type) ? r.reading_type : 'other',
      customer: str(r.customer),
      tail_number: str(r.tail_number).toUpperCase().replace(/[\s-]/g, ''),
      aircraft_type: str(r.aircraft_type).toUpperCase(),
      fuel_type_confirmed: Boolean(r.fuel_type_confirmed),
      meter: r.meter === 'front' || r.meter === 'rear' ? r.meter : '',
      meter_start: str(r.meter_start),
      meter_end: str(r.meter_end),
      gallons_pumped: str(r.gallons_pumped),
      gallons_remaining: str(r.gallons_remaining),
      prist: r.prist === 'yes' || r.prist === 'no' ? r.prist : '',
      req_gals_or_lbs: str(r.req_gals_or_lbs),
      line_tech_initials: str(r.line_tech_initials).toUpperCase(),
      invoice_number: str(r.invoice_number),
      service_time: str(r.service_time),
      notes: str(r.notes),
    })),
    raw_text: rawText,
  }

  return NextResponse.json(result)
}
