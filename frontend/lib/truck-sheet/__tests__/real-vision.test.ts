// Opt-in: RUN_VISION_TRUCK_TEST=1 reads Ted's real scans from the Desktop (never committed), asks Cloud Vision once per
// page and caches the raw JSON on disk (VISION_CACHE_DIR), so re-runs cost nothing. Ground truth JSON (hand-read) lives in
// VISION_TRUTH_DIR and is not in the repo either. Prints a per-field accuracy table.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseVisionResponse, visionWords } from '../ocr-vision'
import { parseJetA } from '../parse-jet-a'
import { compareToTruth, formatScores, type TruthSheet } from './truth-compare'

const RUN = process.env.RUN_VISION_TRUCK_TEST === '1'
const SCANS = '/Users/Ted/Desktop/Minuteman Scans July 2026'
const CACHE = process.env.VISION_CACHE_DIR ?? join(tmpdir(), 'fbo-vision-cache')
const TRUTH = process.env.VISION_TRUTH_DIR ?? ''

const CASES = [
  { pdf: 'Truck Sheets 2026-08-19.pdf', page: 1, name: '0819-p1', truth: 'truth-0819-p1.json' },
  { pdf: 'Truck Sheets 2026-08-19.pdf', page: 2, name: '0819-p2', truth: undefined },
  { pdf: 'Truck Sheets 2026-08-23.pdf', page: 1, name: '0823-p1', truth: 'truth-0823-p1.json' }
]

async function pageWords(pdf: string, page: number, name: string) {
  mkdirSync(CACHE, { recursive: true })
  const cached = join(CACHE, `${name}.json`)
  if (existsSync(cached)) return parseVisionResponse(JSON.parse(readFileSync(cached, 'utf8')))
  const dir = mkdtempSync(join(tmpdir(), 'truck-page-'))
  execFileSync('/opt/homebrew/bin/pdftoppm', ['-r', '200', '-jpeg', '-f', String(page), '-l', String(page), join(SCANS, pdf), join(dir, 'p')])
  const file = execFileSync('/bin/ls', [dir]).toString().trim().split('\n')[0]
  let raw = ''
  const spy: typeof fetch = async (u, i) => {
    const r = await fetch(u, i)
    raw = await r.clone().text()
    return r
  }
  const out = await visionWords(readFileSync(join(dir, file)), spy) // one billable Vision unit
  writeFileSync(cached, raw)
  return out
}

// The vitest setup silences console output, so the report is also appended to <cache dir>/report.txt.
function report(text: string) {
  console.log(text)
  appendFileSync(join(CACHE, 'report.txt'), `${text}\n`)
}

describe.skipIf(!RUN)('real Cloud Vision truck sheets (opt-in)', () => {
  for (const c of CASES) {
    it(`${c.name}`, async () => {
      const sheet = parseJetA(await pageWords(c.pdf, c.page, c.name))
      if (c.truth && TRUTH) {
        const truth = JSON.parse(readFileSync(join(TRUTH, c.truth), 'utf8')) as TruthSheet
        report(formatScores(c.name, compareToTruth(sheet, truth)))
        report(sheet.readings.filter((r) => r.needs_review).map((r, i) => `review ${i}: ${r.review_notes}`).join('\n'))
      } else {
        report(`${c.name} ${ JSON.stringify({ ...sheet, readings: sheet.readings.length })}`)
      }
      if (c.name === '0819-p2') {
        expect(sheet.readings).toHaveLength(0)
        expect(sheet.gallons_down).toBe('4670')
        expect(sheet.front_meter_start).toBe('2505451')
        expect(sheet.rear_meter_start).toBe('105433')
      } else {
        expect(sheet.readings.length).toBeGreaterThan(5)
      }
    })
  }
})
