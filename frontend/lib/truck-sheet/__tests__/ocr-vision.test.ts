import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { parseVisionResponse, VisionError, visionWords } from '../ocr-vision'

const KEY = 'test-key-not-real'
const word = (text: string, v: Array<[number, number]>, confidence = 0.9) => ({
  confidence,
  boundingBox: { vertices: v.map(([x, y]) => ({ x, y })) },
  symbols: [...text].map((t) => ({ text: t }))
})
const body = (words: unknown[]) => ({ responses: [{ fullTextAnnotation: { pages: [{ width: 100, height: 50, blocks: [{ paragraphs: [{ words }] }] }] } }] })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseVisionResponse', () => {
  it('maps words with their corners and joins symbols', () => {
    const page = parseVisionResponse(body([word('4890', [[1, 2], [30, 2], [30, 12], [1, 12]])]))
    expect(page.width).toBe(100)
    expect(page.words).toEqual([{ text: '4890', confidence: 0.9, box: [{ x: 1, y: 2 }, { x: 30, y: 2 }, { x: 30, y: 12 }, { x: 1, y: 12 }] }])
  })
  it('tolerates a page with no text and missing vertex coordinates', () => {
    expect(parseVisionResponse({ responses: [{}] }).words).toEqual([])
    expect(parseVisionResponse(body([word('7', [[0, 0], [5, 0], [5, 5], [0, 5]])])).words[0].box[0]).toEqual({ x: 0, y: 0 })
  })
  it('throws on an error response', () => {
    expect(() => parseVisionResponse({ responses: [{ error: { message: 'bad image' } }] })).toThrow(/bad image/)
  })
})

describe('visionWords', () => {
  it('needs the key and does not leak it in errors', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', '')
    await expect(visionWords(Buffer.from('x'))).rejects.toThrow(/not configured/)
    vi.stubEnv('GOOGLE_VISION_API_KEY', KEY)
    const jpeg = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    const fail = vi.fn(async () => new Response('{}', { status: 403 }))
    const err = await visionWords(jpeg, fail as unknown as typeof fetch).catch((e) => e)
    expect(err).toBeInstanceOf(VisionError)
    expect(err.message).toBe('Vision HTTP 403')
    expect(String(err.message)).not.toContain(KEY)
    const down = vi.fn(async () => {
      throw new Error(`connect failed for key=${KEY}`)
    })
    const err2 = await visionWords(jpeg, down as unknown as typeof fetch).catch((e) => e)
    expect(err2.message).toBe('Vision request failed')
  })

  it('sends the key in a header (never the URL), asks for DOCUMENT_TEXT_DETECTION and caps the image size', async () => {
    vi.stubEnv('GOOGLE_VISION_API_KEY', KEY)
    const big = await sharp({ create: { width: 4000, height: 6000, channels: 3, background: '#ccc' } }).jpeg().toBuffer()
    const ok = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(String(_url)).not.toContain(KEY)
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY)
      const req = JSON.parse(String(init?.body)).requests[0]
      expect(req.features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }])
      const meta = await sharp(Buffer.from(req.image.content, 'base64')).metadata()
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(3000)
      return new Response(JSON.stringify(body([word('1', [[0, 0], [5, 0], [5, 5], [0, 5]])])), { status: 200 })
    })
    const page = await visionWords(big, ok as unknown as typeof fetch)
    expect(page.words).toHaveLength(1)
  })
})
