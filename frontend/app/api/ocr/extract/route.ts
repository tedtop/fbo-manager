import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from process.env

export interface ExtractedFlight {
  tail_number: string
  aircraft_type_icao: string
  call_sign: string
  arrival_time: string   // "HH:MM" or ISO, may be empty
  departure_time: string // "HH:MM" or ISO, may be empty
  origin: string
  destination: string
}

export interface OcrExtractResult {
  schedule_date: string | null  // "YYYY-MM-DD" if visible on document
  flights: ExtractedFlight[]
  raw_text?: string // for debugging
}

const EXTRACT_PROMPT = `Extract all flights from this schedule or manifest document.

Return ONLY a valid JSON object — no prose before or after — in exactly this format:
{
  "schedule_date": "YYYY-MM-DD or null if not clearly visible",
  "flights": [
    {
      "tail_number": "N-number or registration (e.g. N12345, G-ABCD)",
      "aircraft_type_icao": "ICAO type code if visible, else empty string",
      "call_sign": "flight number or call sign if visible, else empty string",
      "arrival_time": "HH:MM in 24h if this is an arrival, else empty string",
      "departure_time": "HH:MM in 24h if this is a departure, else empty string",
      "origin": "origin airport ICAO or IATA code if visible, else empty string",
      "destination": "destination airport ICAO or IATA code if visible, else empty string"
    }
  ]
}

Rules:
- Extract EVERY aircraft/flight visible in the document
- If the document shows a clear date, put it in schedule_date (YYYY-MM-DD format)
- For times, use 24-hour format HH:MM (e.g. "14:30" not "2:30 PM")
- If a flight has both arrival and departure times, include both
- Tail numbers: normalize to remove spaces/dashes inconsistencies (e.g. "N 123 AB" → "N123AB")
- If a field isn't visible or can't be determined, use an empty string
- Do not invent or guess data that isn't on the document`

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

  // Build content block — Claude accepts PDFs natively as document blocks
  // biome-ignore lint/suspicious/noExplicitAny: SDK types for document blocks
  const fileBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
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
    console.error('[OCR] Claude API error:', err)
    return NextResponse.json(
      { error: 'Extraction failed. Check ANTHROPIC_API_KEY and model availability.' },
      { status: 502 }
    )
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''

  // Extract JSON from the response (model may wrap it in markdown code fences)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[OCR] No JSON in response:', rawText)
    return NextResponse.json({ error: 'Could not parse extraction response', raw_text: rawText }, { status: 502 })
  }

  let result: OcrExtractResult
  try {
    result = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in extraction response', raw_text: rawText }, { status: 502 })
  }

  // Normalise — ensure all fields are strings
  result.flights = (result.flights ?? []).map((f) => ({
    tail_number: String(f.tail_number ?? '').toUpperCase().trim(),
    aircraft_type_icao: String(f.aircraft_type_icao ?? '').toUpperCase().trim(),
    call_sign: String(f.call_sign ?? '').trim(),
    arrival_time: String(f.arrival_time ?? '').trim(),
    departure_time: String(f.departure_time ?? '').trim(),
    origin: String(f.origin ?? '').toUpperCase().trim(),
    destination: String(f.destination ?? '').toUpperCase().trim(),
  }))

  return NextResponse.json({ ...result, raw_text: rawText })
}
