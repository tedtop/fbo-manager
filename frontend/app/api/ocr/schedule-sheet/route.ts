import Anthropic from '@anthropic-ai/sdk'
import { type NextRequest, NextResponse } from 'next/server'
import {
  mergeScheduleSheets,
  normalizeScheduleSheet
} from '@/lib/schedule-import/normalize'
import type { ExtractedScheduleSheet } from '@/lib/schedule-import/types'

export type {
  ExtractedScheduleRow,
  ExtractedScheduleSheet
} from '@/lib/schedule-import/types'

// Same model as the truck-sheet route unless SCHEDULE_OCR_MODEL overrides it.
const DEFAULT_MODEL = 'claude-opus-4-8'

const EXTRACT_PROMPT = `This is a scan or photo of a PRINTED front-desk flight schedule from an FBO (airport service desk): a table listing aircraft that are arriving and/or departing, printed by the desk's scheduling software. It is not handwritten. The page may be rotated in any direction, including upside down, and may be landscape or portrait; mentally reorient it before reading. It may have several pages (later pages are later parts of the same schedule) and the table may continue across pages with repeated column headings.

WHAT TO LOOK FOR
- Sheet heading: the software or company name in the title, logo, header or footer (source_software_hint), and the date the schedule is for. A sheet may cover one date (sheet_date) or a range of days (date_range_start / date_range_end). Leave a field null when no date is clearly printed. Do not use the printing timestamp ("Printed 11/04 6:02 AM") as the schedule date unless nothing else is printed.
- Day headings: rows may be grouped under a date heading such as "Thursday, November 5, 2026" or "11/05". For every row, set group_date to the date of the heading it sits under (YYYY-MM-DD); use "" if the sheet has no day headings. Keep applying the last heading to following rows, including on the next page, until a new heading appears.
- Columns vary by software and are not fixed. Typical ones: tail / registration / N-number, aircraft type, customer / owner / operator / company / contact, arrival (ETA) date and time, departure (ETD) date and time, services / requests (fuel, GPU, lav, catering, hangar, car...), remarks / notes / comments. Map whatever columns exist; a column that does not exist stays "". A single "Time" column under an "Arrivals" or "Departures" section means that section's time; the same aircraft may then appear once in each section as separate rows: output them as separate rows exactly as printed and do not merge them.

FOR EACH ROW
- tail_number: uppercase, no spaces/dashes/dots ("N 116 FE" -> "N116FE", "C-GABC" -> "CGABC"). "" if absent or unreadable. Never invent or "fix" digits.
- aircraft_type: exactly as printed, uppercase (an ICAO code like "C525" or "GLF4", or a name like "CITATION CJ3"). "" if absent.
- customer: the owner/operator/customer/contact text as printed, "" if none.
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
): Promise<{ ok: true; sheet: ExtractedScheduleSheet } | { ok: false; response: NextResponse }> {
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
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' },
        { status: 502 }
      )
    }
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR schedule-sheet] No JSON in response:', rawText)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Could not parse extraction response', raw_text: rawText },
        { status: 502 }
      )
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid JSON in extraction response', raw_text: rawText },
        { status: 502 }
      )
    }
  }

  return { ok: true, sheet: normalizeScheduleSheet(parsed, rawText) }
}

// POST multipart/form-data with one or more `file` entries (image or PDF; one entry per photo, or one PDF holding all
// pages). Always answers with a single ExtractedScheduleSheet: with several files the rows are concatenated in upload
// order and each row's `page` is its file number.
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

  const files = formData.getAll('file').filter((f): f is File => typeof f !== 'string')
  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  for (const file of files) {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image (JPEG, PNG) or PDF' },
        { status: 400 }
      )
    }
  }

  const client = new Anthropic() // reads ANTHROPIC_API_KEY from process.env
  const model = process.env.SCHEDULE_OCR_MODEL || DEFAULT_MODEL

  const sheets: ExtractedScheduleSheet[] = []
  for (const file of files) {
    const result = await extractFromFile(client, file, model)
    if (!result.ok) return result.response
    sheets.push(result.sheet)
  }

  return NextResponse.json(sheets.length === 1 ? sheets[0] : mergeScheduleSheets(sheets))
}
