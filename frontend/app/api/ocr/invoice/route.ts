import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export interface OcrInvoiceLineItem {
  description: string
  quantity: string   // raw string to preserve precision
  unit_price: string // raw string, dollars (e.g. "6.45")
  total_price: string
}

export interface OcrInvoiceResult {
  invoice_date: string | null    // "YYYY-MM-DD"
  customer_name: string
  tail_number: string            // aircraft registration e.g. "N12345"
  line_items: OcrInvoiceLineItem[]
  subtotal: string
  total_amount: string
  notes: string
  raw_text?: string
}

const PROMPT = `You are extracting data from a handwritten or printed paper invoice from Minuteman Aviation FBO.

FBO invoices typically contain:
- A date (top of page)
- Customer name or company
- Aircraft tail number (N-number registration, e.g. N12345, G-ABCD)
- Line items: each has a description, quantity, unit price, and line total
- A subtotal and grand total
- Optional notes or comments

Return ONLY valid JSON in exactly this format — no prose before or after:

{
  "invoice_date": "YYYY-MM-DD or null if not clearly visible",
  "customer_name": "customer or company name as written, empty string if not visible",
  "tail_number": "aircraft N-number normalized (e.g. N12345), empty string if not visible",
  "line_items": [
    {
      "description": "service or product description as written",
      "quantity": "numeric quantity as string (e.g. '1', '45.2'), '1' if not specified",
      "unit_price": "unit price in dollars as string (e.g. '6.45'), empty string if not visible",
      "total_price": "line total in dollars as string (e.g. '290.25'), empty string if not visible"
    }
  ],
  "subtotal": "subtotal in dollars as string, empty string if not visible",
  "total_amount": "grand total in dollars as string, empty string if not visible",
  "notes": "any additional notes or comments written on the invoice, empty string if none"
}

Rules:
- Extract EVERY line item visible on the invoice
- Normalize tail numbers: remove extra spaces (e.g. "N 123 AB" → "N123AB"), uppercase
- Currency: extract just the numeric value, no $ sign (e.g. "$6.45" → "6.45")
- If a quantity is not written, assume "1"
- For fuel line items, the quantity is typically gallons
- If a total is handwritten and differs from qty×price, use the written total
- Do not invent data not visible on the invoice — use empty string for unknown fields`

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
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const isPdf = file.type === 'application/pdf'
  const isImage = file.type.startsWith('image/')
  if (!isPdf && !isImage) {
    return NextResponse.json({ error: 'File must be an image (JPEG, PNG) or PDF' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  // biome-ignore lint/suspicious/noExplicitAny: SDK document block typing
  const fileBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 } }

  let message: Anthropic.Message
  try {
    message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
    })
  } catch (err) {
    console.error('[OCR invoice] Claude error:', err)
    return NextResponse.json({ error: 'Extraction failed. Check ANTHROPIC_API_KEY.' }, { status: 502 })
  }

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'No JSON in response', raw_text: rawText }, { status: 502 })
  }

  let result: OcrInvoiceResult
  try {
    result = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in response', raw_text: rawText }, { status: 502 })
  }

  result.customer_name = String(result.customer_name ?? '').trim()
  result.tail_number   = String(result.tail_number   ?? '').toUpperCase().trim()
  result.subtotal      = String(result.subtotal      ?? '').trim()
  result.total_amount  = String(result.total_amount  ?? '').trim()
  result.notes         = String(result.notes         ?? '').trim()

  result.line_items = (result.line_items ?? []).map((item) => ({
    description: String(item.description ?? '').trim(),
    quantity:    String(item.quantity    ?? '1').trim(),
    unit_price:  String(item.unit_price  ?? '').trim(),
    total_price: String(item.total_price ?? '').trim(),
  }))

  return NextResponse.json({ ...result, raw_text: rawText })
}
