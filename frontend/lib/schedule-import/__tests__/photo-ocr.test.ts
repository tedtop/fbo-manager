import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { extractScheduleSheet } from '../extract-sheet'
import { closeTesseract, tesseractOcr } from '../ocr-tesseract'

// Opt-in (slow, runs the real Tesseract engine over the real photo): RUN_OCR_PHOTO_TEST=1 pnpm exec vitest run photo-ocr
// Rotated and skewed copies are made with sharp. Set OCR_PHOTO_VERBOSE=1 to print the parsed rows.
const PHOTO = path.join(__dirname, '../../../../docs/samples/schedule-sheet-2026-11-04.jpg')
const run = process.env.RUN_OCR_PHOTO_TEST === '1'

async function variant(name: string, make: (b: Buffer) => Promise<Buffer>) {
  const bytes = await make(readFileSync(PHOTO))
  return new File([new Uint8Array(bytes)], `${name}.jpg`, { type: 'image/jpeg' })
}

const same = (b: Buffer) => Promise.resolve(b)
const cases: Array<[string, (b: Buffer) => Promise<Buffer>]> = [
  ['original', same],
  ['rotated 90', (b) => sharp(b).rotate(90).jpeg().toBuffer()],
  ['rotated 180', (b) => sharp(b).rotate(180).jpeg().toBuffer()],
  ['skewed 3 deg', (b) => sharp(b).rotate(3, { background: '#ffffff' }).jpeg().toBuffer()],
  ['skewed 8 deg', (b) => sharp(b).rotate(8, { background: '#ffffff' }).jpeg().toBuffer()],
  ['skewed -6 deg', (b) => sharp(b).rotate(-6, { background: '#ffffff' }).jpeg().toBuffer()]
]

describe.skipIf(!run)('real engine over the sample photo', () => {
  afterAll(() => closeTesseract())
  for (const [name, make] of cases) {
    it(name, async () => {
      const file = await variant(name, make)
      const r = await extractScheduleSheet(file, { tesseract: tesseractOcr })
      if (process.env.OCR_PHOTO_VERBOSE) console.log(name, r.ok ? r.sheet.rows.map((x) => [x.tail_number, x.arrival_date || x.departure_date, x.arrival_time || x.departure_time, x.arrival_time ? 'A' : 'D', x.customer, x.services, x.needs_review].join(' ; ')).join('\n') : JSON.stringify(r))
      expect(r.ok).toBe(true)
      if (name === 'original' && r.ok) expect(r.sheet.rows.map((x) => x.tail_number)).toEqual(['N509CQ', 'N868CB', 'N868CB', 'N33PX', 'N555HM', 'N555HM'])
    }, 120_000)
  }
})
