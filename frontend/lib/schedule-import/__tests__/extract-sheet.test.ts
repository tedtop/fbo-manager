import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ExtractDeps, extractScheduleSheet, resetExtractLogState } from '../extract-sheet'
import { visionOcr } from '../ocr-vision'

const PHOTO_TEXT = readFileSync(path.join(__dirname, 'total-fbo-photo.txt'), 'utf8')
const file = new File(['x'], 'sheet.jpg', { type: 'image/jpeg' })
const log = vi.fn()
const base = (over: Partial<ExtractDeps> = {}): ExtractDeps => ({
  tesseract: async () => ({ text: PHOTO_TEXT, confidence: 85 }),
  log,
  ...over
})

beforeEach(() => {
  log.mockClear()
  resetExtractLogState()
})

describe('extractScheduleSheet', () => {
  it('uses Tesseract alone when the read is good, never calling Vision', async () => {
    const vision = vi.fn()
    const r = await extractScheduleSheet(file, base({ vision }))
    expect(r.ok && r.engine).toBe('tesseract')
    expect(r.ok && r.sheet.rows).toHaveLength(6)
    expect(vision).not.toHaveBeenCalled()
  })

  it('reruns through Vision on low confidence and keeps the better parse', async () => {
    const better = PHOTO_TEXT.replace('41/26/2026', '11/26/2026')
    const vision = vi.fn(async () => ({ text: better, confidence: 95 }))
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: PHOTO_TEXT, confidence: 40 }), vision }))
    expect(vision).toHaveBeenCalledOnce()
    expect(r.ok && r.engine).toBe('vision')
    expect(r.ok && r.sheet.rows.some((x) => x.needs_review)).toBe(false)
  })

  it('keeps Tesseract when Vision parses worse', async () => {
    const vision = async () => ({ text: 'garbage', confidence: 90 })
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: PHOTO_TEXT, confidence: 40 }), vision }))
    expect(r.ok && r.engine).toBe('tesseract')
  })

  it('goes to Vision when Tesseract yields zero rows', async () => {
    const vision = vi.fn(async () => ({ text: PHOTO_TEXT, confidence: 90 }))
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: '', confidence: 90 }), vision }))
    expect(r.ok && r.engine).toBe('vision')
  })

  it('goes to Vision when more than a third of rows need review', async () => {
    const noisy = PHOTO_TEXT.replace('N868CB CJ2', 'N8S8CB CJ2').replace('N33PX', 'N3PX9Q').replace('N509CQ', 'N5O9CQ')
    const vision = vi.fn(async () => ({ text: PHOTO_TEXT, confidence: 90 }))
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: noisy, confidence: 90 }), vision }))
    expect(vision).toHaveBeenCalledOnce()
    expect(r.ok && r.engine).toBe('vision')
  })

  it('skips Vision silently (logging once) when no key is configured', async () => {
    const poor = { tesseract: async () => ({ text: PHOTO_TEXT, confidence: 30 }) }
    await extractScheduleSheet(file, base(poor))
    await extractScheduleSheet(file, base(poor))
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('survives a Vision failure by keeping the Tesseract read', async () => {
    const vision = async () => {
      throw new Error('boom')
    }
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: PHOTO_TEXT, confidence: 40 }), vision }))
    expect(r.ok && r.engine).toBe('tesseract')
  })

  it('answers 422 with the raw text for an unknown format when Claude is off', async () => {
    const r = await extractScheduleSheet(file, base({ tesseract: async () => ({ text: 'Fuel log\nTank 1 4500', confidence: 90 }) }))
    expect(r).toEqual({ ok: false, status: 422, error: 'Unrecognised sheet format', raw_text: 'Fuel log\nTank 1 4500' })
  })

  it('uses Claude only for an unrecognised format and only when provided', async () => {
    const sheet = { sheet_date: null, date_range_start: null, date_range_end: null, source_software_hint: '', rows: [] }
    const claude = vi.fn(async () => ({ ok: true as const, sheet, engine: 'claude' as const }))
    const unknown = { tesseract: async () => ({ text: 'Fuel log', confidence: 90 }) }
    const r = await extractScheduleSheet(file, base({ ...unknown, claude }))
    expect(claude).toHaveBeenCalledOnce()
    expect(r.ok && r.engine).toBe('claude')
    claude.mockClear()
    await extractScheduleSheet(file, base({ claude }))
    expect(claude).not.toHaveBeenCalled()
  })

  it('answers 500 when Tesseract throws and nothing else can read the sheet', async () => {
    const r = await extractScheduleSheet(file, base({ tesseract: async () => { throw new Error('no worker') } }))
    expect(r).toEqual({ ok: false, status: 500, error: 'Text recognition failed' })
  })
})

describe('visionOcr (fetch mocked)', () => {
  it('posts DOCUMENT_TEXT_DETECTION with the key in a header and returns text and mean confidence', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          responses: [
            {
              fullTextAnnotation: {
                text: 'hello',
                pages: [{ blocks: [{ paragraphs: [{ words: [{ confidence: 0.9 }, { confidence: 0.7 }] }] }] }]
              }
            }
          ]
        })
      )
    )
    const r = await visionOcr(file, fetchMock as unknown as typeof fetch)
    expect(r.text).toBe('hello')
    expect(r.confidence).toBeCloseTo(80)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://vision.googleapis.com/v1/images:annotate')
    expect(url).not.toContain('test-key')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    expect(JSON.parse(init.body as string).requests[0].features[0].type).toBe('DOCUMENT_TEXT_DETECTION')
    Reflect.deleteProperty(process.env, 'GOOGLE_VISION_API_KEY')
  })

  it('throws on an API error response', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    const fetchMock = async () => new Response(JSON.stringify({ responses: [{ error: { message: 'quota' } }] }))
    await expect(visionOcr(file, fetchMock as unknown as typeof fetch)).rejects.toThrow('quota')
    Reflect.deleteProperty(process.env, 'GOOGLE_VISION_API_KEY')
  })
})
