import Anthropic from '@anthropic-ai/sdk'
import { type NextRequest, NextResponse } from 'next/server'
import { denied, requireModule } from '@/lib/supabase/require-module'
import { type ExtractDeps, extractScheduleSheet, type SheetExtraction } from '@/lib/schedule-import/extract-sheet'
import {
  mergeScheduleSheets,
  normalizeScheduleSheet
} from '@/lib/schedule-import/normalize'
import { tesseractOcr } from '@/lib/schedule-import/ocr-tesseract'
import { visionConfigured, visionOcr } from '@/lib/schedule-import/ocr-vision'
import type { ExtractedScheduleSheet } from '@/lib/schedule-import/types'

export type {
  ExtractedScheduleRow,
  ExtractedScheduleSheet
} from '@/lib/schedule-import/types'

// The Claude vision path below is the LAST resort: Ted does not pay API credit for this project. It runs only when
// SCHEDULE_OCR_ALLOW_CLAUDE=1 (and ANTHROPIC_API_KEY is set) and the sheet's format is not the one the parser knows.
// Default engines are Tesseract, then Google Cloud Vision (lib/schedule-import/extract-sheet.ts).
// Same model as the truck-sheet route unless SCHEDULE_OCR_MODEL overrides it.
const DEFAULT_MODEL = 'claude-opus-4-8'

const EXTRACT_PROMPT = `This is a scan or photo of a PRINTED front-desk flight schedule from an FBO (airport service desk): a table listing aircraft that are arriving and/or departing, printed by the desk's scheduling software. It is not handwritten. The page may be rotated in any direction, including upside down, and may be landscape or portrait; mentally reorient it before reading. It may have several pages (later pages are later parts of the same schedule) and the table may continue across pages with repeated column headings.

WHAT TO LOOK FOR
- Sheet heading: the software or company name in the title, logo, header or footer (source_software_hint), and the date the schedule is for. A sheet may cover one date (sheet_date) or a range of days (date_range_start / date_range_end). Leave a field null when no date is clearly printed. Do not use the printing timestamp ("Printed 11/04 6:02 AM") as the schedule date unless nothing else is printed.
- Day headings: rows may be grouped under a date heading such as "Thursday, November 5, 2026" or "11/05". For every row, set group_date to the date of the heading it sits under (YYYY-MM-DD); use "" if the sheet has no day headings. Keep applying the last heading to following rows, including on the next page, until a new heading appears.
- Columns vary by software and are not fixed. Typical ones: tail / registration / N-number, aircraft type, customer / owner / operator / company / contact, arrival (ETA) date and time, departure (ETD) date and time, services / requests (fuel, GPU, lav, catering, hangar, car...), remarks / notes / comments. Map whatever columns exist; a column that does not exist stays "". A single "Time" column under an "Arrivals" or "Departures" section means that section's time; the same aircraft may then appear once in each section as separate rows: output them as separate rows exactly as printed and do not merge them.

SHEETS WITH AN ACTION COLUMN (one leg per printed row)
Some reports (for example "Scheduled Arrivals and Requests") print ONE date and ONE time per row plus an Action column (Arrive / Arrival / Depart / Departure). Each such row is a single leg, not a whole visit:
- Action Arrive: put the row's date in arrival_date and its time in arrival_time; departure_date and departure_time stay "".
- Action Depart: put the row's date in departure_date and its time in departure_time; arrival_date and arrival_time stay "".
- The date is printed IN the row, so it goes in arrival_date / departure_date (not only group_date). Do not merge an aircraft's Arrive row and Depart row: output them as two separate rows exactly as printed (a later step pairs them).
- Small sub-lines under a row (for example "Service Duration - Short Stay") go to notes, verbatim. Lines under "Services Required:" (for example "Rental Car - Passenger: Sadler", "Fullsize Hertz - Status: Confirmed") go to services, one entry per line, comma separated. If "Services Required:" has nothing under it, services is "".
- A "Confirmed" column holds a date that matters little: do not put it in any date or time field; append it to notes as "Confirmed <date as printed>" (after any other notes, separated by "; ").
- The aircraft type column is free text (for example "CJ2", "ENCORE", "BRAVO", "G-IVSP"): copy it exactly as printed in aircraft_type, do not convert it to an ICAO code.
- Ignore the "Run:" print timestamp and the page number. The "For The Period: A Through: B" line gives date_range_start and date_range_end.

FOR EACH ROW
- tail_number: uppercase, no spaces/dashes/dots ("N 116 FE" -> "N116FE", "C-GABC" -> "CGABC"). "" if absent or unreadable. Never invent or "fix" digits.
- aircraft_type: exactly as printed, uppercase (an ICAO code like "C525" or "GLF4", or a name like "CITATION CJ3"). "" if absent.
- customer: the owner/operator/customer/contact text as printed, "" if none.
- origin: where the aircraft is coming from, only when the sheet has a column for it (From, Coming From, Origin, Last Stop), exactly as printed, uppercase (an airport code like "SEA" or "KBZN", or a place name). "" if there is no such column or it is blank. Do not guess it from the tail or the customer.
- destination: where the aircraft goes next, only when the sheet has a column for it (To, Next Stop, Destination), exactly as printed, uppercase. "" if there is no such column or it is blank.
- arrival_date / departure_date: ONLY when a date is printed in that row itself (YYYY-MM-DD; infer the year from the sheet date or heading when the row shows only month/day, month before day for US sheets). Otherwise "". Do not copy the day heading into these fields; that is group_date.
- arrival_time / departure_time: 24-hour "HH:mm" ("0545" -> "05:45", "5:45 PM" -> "17:45"). If a time is printed with a Z/UTC marker or the clock convention is unclear, copy it exactly as printed instead of converting. "" if blank, "TBD" or a dash. If a time has no AM/PM marker and the sheet is not clearly 24-hour, copy it verbatim and set needs_review.
- services: the services/requests text as printed (comma separated), "" if none.
- notes: remarks/comments text as printed, "" if none.
- raw_row_text: the entire row transcribed left to right as one line, columns separated by " | ", exactly as printed.
- needs_review: true when any part of this row is hard to read, cut off, smudged, ambiguous, or you are guessing at a character, date or time. Otherwise false.
- confidence: "high", "medium" or "low" for the row as a whole.
- Skip column headings, day headings (they only set group_date), page numbers, totals, blank lines and footers. Output EVERY aircraft row, in printed order, across all pages. Do not invent rows or data that is not on the page.

Return ONLY a valid JSON object, no prose before or after, in exactly this format (all values strings except the booleans; empty string when not visible; null only for the sheet-level dates):
{
  "sheet_date": "YYYY-MM-DD or null",
  "date_range_start": "YYYY-MM-DD or null",
  "date_range_end": "YYYY-MM-DD or null",
  "source_software_hint": "",
  "rows": [
    {
      "tail_number": "",
      "aircraft_type": "",
      "customer": "",
      "origin": "",
      "destination": "",
      "group_date": "",
      "arrival_date": "",
      "arrival_time": "",
      "departure_date": "",
      "departure_time": "",
      "services": "",
      "notes": "",
      "raw_row_text": "",
      "needs_review": false,
      "confidence": "high|medium|low"
    }
  ]
}`

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

async function extractFromFile(
  client: Anthropic,
  file: File,
  model: string
): Promise<SheetExtraction> {
  const isPdf = file.type === 'application/pdf'
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // biome-ignore lint/suspicious/noExplicitAny: SDK types for document blocks
  const fileBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as MediaType, data: base64 } }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [fileBlock, { type: 'text', text: EXTRACT_PROMPT }]
        }
      ]
    })
  } catch (err) {
    console.error('[OCR schedule-sheet] Claude API error:', err)
    return { ok: false, status: 502, error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' }
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR schedule-sheet] No JSON in response:', rawText)
    return { ok: false, status: 502, error: 'Could not parse extraction response', raw_text: rawText }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return { ok: false, status: 502, error: 'Invalid JSON in extraction response', raw_text: rawText }
  }

  return { ok: true, sheet: normalizeScheduleSheet(parsed, rawText), engine: 'claude' }
}

// POST multipart/form-data with one or more `file` entries (photos; one entry per photo). Always answers with a single
// ExtractedScheduleSheet: with several files the rows are concatenated in upload order and each row's `page` is its
// file number. PDFs are not read yet (no free rasterizer): photos only.
export async function POST(req: NextRequest) {
  const check = await requireModule('flight_operations')
  if (!check.ok) return denied(check)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const files = formData.getAll('file').filter((f): f is File => typeof f !== 'string')
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  for (const file of files) {
    if (file.type === 'application/pdf') {
      return NextResponse.json(
        { error: 'PDF is not supported yet: please upload photos (JPEG or PNG) of the sheet' },
        { status: 400 }
      )
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image (JPEG, PNG)' }, { status: 400 })
    }
  }

  const claudeAllowed = process.env.SCHEDULE_OCR_ALLOW_CLAUDE === '1' && !!process.env.ANTHROPIC_API_KEY
  const deps: ExtractDeps = {
    tesseract: tesseractOcr,
    vision: visionConfigured() ? (f) => visionOcr(f) : undefined,
    claude: claudeAllowed
      ? (f) => extractFromFile(new Anthropic(), f, process.env.SCHEDULE_OCR_MODEL || DEFAULT_MODEL)
      : undefined
  }

  const sheets: ExtractedScheduleSheet[] = []
  for (const file of files) {
    const result = await extractScheduleSheet(file, deps)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.raw_text !== undefined ? { raw_text: result.raw_text } : {}) },
        { status: result.status }
      )
    }
    sheets.push(result.sheet)
  }

  return NextResponse.json(sheets.length === 1 ? sheets[0] : mergeScheduleSheets(sheets))
}
