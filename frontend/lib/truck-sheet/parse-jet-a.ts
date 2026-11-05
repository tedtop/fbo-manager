// Geometry-based reader for the "2026 Truck Sheet Jet v4" form (pure: Cloud Vision words in, ExtractedTruckSheet out).
//
// 1. Orientation: every Vision word carries its corners in reading order, so the median direction of corner 0 -> 1 is
//    the page rotation (0, 90, 180, 270 or any tilt). All words are rotated upright with it.
// 2. Rows: every printed row carries a "Circle / YES" label in the narrow fuel-type column. Those labels are found even
//    on empty rows, so they give the row bands (and the row count) without needing the ruled lines.
// 3. Columns: header words ("Customer", "Tail Number", "Meter Start", ...) are matched to a reference layout measured on
//    the real form; boundaries between columns are interpolated piecewise-linearly between the headers found, which
//    absorbs scale and mild perspective differences between photos.
// 4. Each remaining word is assigned to a (row, column) cell; words glued across a column boundary ("1480715") are split
//    by character position. Cells become fields, then repair.ts checks the arithmetic.
import { repairArithmetic } from './repair'
import type { ExtractedReading, ExtractedReadingType, ExtractedTruckSheet, OcrPage, OcrWord } from './types'

interface UWord {
  text: string
  conf: number
  cx: number
  cy: number
  l: number
  r: number
  t: number
  b: number
  h: number
}

type Col = 'customer' | 'tail' | 'type' | 'yes' | 'start' | 'end' | 'gallons' | 'starting' | 'prist' | 'tech' | 'invoice'
const COLS: Col[] = ['customer', 'tail', 'type', 'yes', 'start', 'end', 'gallons', 'starting', 'prist', 'tech', 'invoice']

// Reference layout (x of the header marker word per column, and the 10 boundaries between the 11 columns), measured on
// a real sheet in upright pixels of a 3000 px photo. Only the proportions matter: they are re-fitted per page.
const REF_ANCHOR: Record<Col, number> = {
  customer: -2733,
  tail: -2452,
  type: -2189,
  yes: -2057,
  start: -1781,
  end: -1415,
  gallons: -1172,
  starting: -968,
  prist: -792,
  tech: -481,
  invoice: -300
}
const REF_BOUNDS = [-2594, -2356, -2109, -2017, -1644, -1265, -1062, -852, -564, -361]

const ROW_ABOVE = 0.27 // a row band starts this many pitches above its "Circle" label
const ROW_BELOW = 0.73

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------- orientation ----------

export function pageAngleDegrees(words: OcrWord[]): number {
  const pick = words.filter((w) => w.text.length >= 2)
  const src = pick.length >= 5 ? pick : words
  // Median of the direction vectors (not of the angles) so that +180 / -180 do not split.
  const sx = median(src.map((w) => w.box[1].x - w.box[0].x))
  const sy = median(src.map((w) => w.box[1].y - w.box[0].y))
  return (Math.atan2(sy, sx) * 180) / Math.PI
}

export function uprightWords(page: OcrPage): UWord[] {
  const a = (-pageAngleDegrees(page.words) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const upright = page.words.map((w) => {
    const pts = w.box.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const l = Math.min(...xs)
    const r = Math.max(...xs)
    const t = Math.min(...ys)
    const b = Math.max(...ys)
    return { text: w.text, conf: w.confidence, cx: (l + r) / 2, cy: (t + b) / 2, l, r, t, b, h: b - t }
  })
  // Vision sometimes reports the same handwritten word twice at the same spot: keep one.
  return upright.filter(
    (w, i) => !upright.some((o, j) => j < i && o.text === w.text && Math.abs(o.cx - w.cx) < w.h * 0.3 && Math.abs(o.cy - w.cy) < w.h * 0.3)
  )
}

// ---------- layout ----------

interface Layout {
  rows: number[] // y of each row's "Circle" label
  pitch: number
  rowTop: (i: number) => number
  bounds: number[] // 10 column boundaries in page x
}

export function findRows(words: UWord[]): { rows: number[]; pitch: number; yesX: number } | null {
  const circles = words.filter((w) => /^circle$/i.test(w.text) && w.text[0] === 'C')
  if (circles.length < 2) return null
  // the printed "Circle" labels share one x; the header's "(circle one)" is lowercase and elsewhere
  const best = circles
    .map((c) => circles.filter((o) => Math.abs(o.cx - c.cx) < 40))
    .sort((a, b) => b.length - a.length)[0]
  if (best.length < 2) return null
  const ys = best.map((w) => w.cy).sort((a, b) => a - b)
  const diffs = ys.slice(1).map((y, i) => y - ys[i])
  const pitch = median(diffs.filter((d) => d > 0))
  const rows = [ys[0]]
  for (let i = 1; i < ys.length; i++) {
    const gap = ys[i] - ys[i - 1]
    const steps = Math.round(gap / pitch)
    for (let k = 1; k < steps; k++) rows.push(ys[i - 1] + (gap * k) / steps) // a "Circle" Vision missed
    rows.push(ys[i])
  }
  return { rows, pitch, yesX: median(best.map((w) => w.cx)) }
}

export function headerAnchors(words: UWord[], top: number, pitch: number, yesX: number): Partial<Record<Col, number>> {
  const zone = words.filter((w) => w.cy < top - 0.4 * pitch && w.cy > top - 520)
  const lowest = (re: RegExp) => zone.filter((w) => re.test(w.text)).sort((a, b) => b.cy - a.cy)[0]
  const out: Partial<Record<Col, number>> = { yes: yesX }
  const set = (c: Col, w: UWord | undefined) => {
    if (w) out[c] = w.cx
  }
  set('customer', lowest(/^customer$/i))
  set('tail', lowest(/^number$/i))
  set('type', lowest(/^type$/i))
  set('start', lowest(/^start$/i))
  set('end', lowest(/^end$/i))
  set('gallons', lowest(/^pumped$/i))
  set('starting', lowest(/^starting$/i))
  set('prist', lowest(/^req$/i))
  set('tech', lowest(/^initials$/i))
  set('invoice', lowest(/^invoice$/i))
  return out
}

/** Piecewise-linear map from the reference layout to this page, through the header anchors that were found. */
function fitMap(found: Partial<Record<Col, number>>): ((x: number) => number) | null {
  const pairs = COLS.filter((c) => found[c] != null)
    .map((c) => [REF_ANCHOR[c], found[c] as number] as [number, number])
    .sort((a, b) => a[0] - b[0])
  if (pairs.length < 3) return null
  return (x: number) => {
    let i = 0
    while (i < pairs.length - 2 && x > pairs[i + 1][0]) i++
    const [r0, m0] = pairs[i]
    const [r1, m1] = pairs[i + 1]
    return m0 + ((x - r0) * (m1 - m0)) / (r1 - r0)
  }
}

function colOf(x: number, bounds: number[]): Col {
  let i = 0
  while (i < bounds.length && x >= bounds[i]) i++
  return COLS[i]
}

// ---------- cells ----------

const NUM_LETTERS: Record<string, string> = { O: '0', o: '0', D: '0', I: '1', l: '1', '|': '1', S: '5', B: '8', Z: '2' }

function digitsOf(text: string): string {
  return text
    .split('')
    .map((c) => NUM_LETTERS[c] ?? c)
    .join('')
    .replace(/[^0-9]/g, '')
}

/** Words of one cell as text lines: top to bottom, left to right inside a line. */
function lines(ws: UWord[]): UWord[][] {
  const hs = median(ws.map((w) => w.h)) || 1
  const sorted = [...ws].sort((a, b) => a.cy - b.cy)
  const out: UWord[][] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(w.cy - median(last.map((x) => x.cy))) < hs * 0.6) last.push(w)
    else out.push([w])
  }
  return out.map((l) => l.sort((a, b) => a.cx - b.cx))
}

function textOf(ws: UWord[], sep: string): string {
  return lines(ws)
    .map((l) => l.map((w) => w.text).join(sep === ' ' ? ' ' : ''))
    .join(sep)
    .trim()
}

/** Meter / gallons digits; a single small digit written raised after the number is the tenths digit. */
function numberOf(ws: UWord[]): string {
  if (ws.length === 0) return ''
  const sorted = [...ws].sort((a, b) => a.cx - b.cx)
  const last = sorted[sorted.length - 1]
  const main = sorted.slice(0, -1)
  if (main.length > 0 && digitsOf(last.text).length === 1 && last.text.length === 1) {
    const mainH = median(main.map((w) => w.h))
    const mainY = median(main.map((w) => w.cy))
    if (last.h < mainH * 0.8 && last.cy < mainY - mainH * 0.15) {
      const whole = main.map((w) => digitsOf(w.text)).join('')
      if (whole) return `${whole}.${digitsOf(last.text)}`
    }
  }
  return sorted.map((w) => digitsOf(w.text)).join('')
}

function splitAcrossColumns(words: UWord[], bounds: number[]): UWord[] {
  const out: UWord[] = []
  for (const w of words) {
    const n = w.text.length
    if (n < 2 || !/\d/.test(w.text)) {
      out.push(w)
      continue
    }
    const w1 = (w.r - w.l) / n
    const cols = Array.from({ length: n }, (_, i) => colOf(w.l + (i + 0.5) * w1, bounds))
    // The narrow fuel-type column holds no handwriting, so a character landing there belongs to a neighbour: it joins the
    // side whose characters are of its own kind (letter or digit), the right side when both or neither are.
    const kind = (c: string) => (/\d/.test(c) ? 'd' : 'a')
    for (let i = 0; i < n; i++) {
      if (cols[i] !== 'yes') continue
      let j = i - 1
      while (j >= 0 && cols[j] === 'yes') j--
      let k = i + 1
      while (k < n && cols[k] === 'yes') k++
      const left = j >= 0 ? kind(w.text[j]) : null
      const right = k < n ? kind(w.text[k]) : null
      const me = kind(w.text[i])
      cols[i] = (left === me && right !== me ? cols[j] : right != null ? cols[k] : cols[j]) as Col
    }
    if (cols.every((c) => c === cols[0])) {
      out.push(w)
      continue
    }
    // Runs of characters per column. A run of a single character is a stray edge digit, not a second cell:
    // when any run is that short the whole word goes to its majority column instead of being split.
    const runs: Array<[number, number]> = []
    let s = 0
    for (let i = 1; i <= n; i++) {
      if (i === n || cols[i] !== cols[s]) {
        runs.push([s, i])
        s = i
      }
    }
    if (runs.some(([a, b]) => b - a < 2)) {
      out.push(w)
      continue
    }
    for (const [a, b] of runs)
      out.push({ ...w, text: w.text.slice(a, b), l: w.l + a * w1, r: w.l + b * w1, cx: w.l + ((a + b) / 2) * w1 })
  }
  return out
}

function classify(customer: string): ExtractedReadingType {
  const c = customer.trim().toLowerCase().replace(/\s+/g, '')
  if (/^t[1-9]$/.test(c) || /^tanks?\b/.test(c) || /^farm/.test(c)) return 'tank_fill'
  if (/^x(fer)?(from|in)/.test(c)) return 'transfer_in'
  if (/^x(fer)?(to|out)/.test(c)) return 'transfer_out'
  return 'fueling'
}

function normTime(s: string): string {
  const d = s.replace(/\D/g, '')
  return d.length === 3 ? `0${d}` : d
}
const isTime = (s: string) => /^([01]\d|2[0-3])[0-5]\d$/.test(s)

// ---------- header ----------

function belowLabel(words: UWord[], label: UWord[], maxDy: number): UWord[] {
  const l = Math.min(...label.map((w) => w.l))
  const r = Math.max(...label.map((w) => w.r))
  const bottom = Math.max(...label.map((w) => w.b))
  const pad = (r - l) * 0.15
  return words.filter((w) => w.cx > l - pad && w.cx < r + pad && w.t >= bottom - 2 && w.t < bottom + maxDy)
}

function headerValue(words: UWord[], labelRe: RegExp, limit: number, nextRe?: RegExp): string {
  const above = words.filter((w) => w.cy < limit).sort((a, b) => a.cy - b.cy)
  for (const first of above.filter((w) => labelRe.test(w.text))) {
    let label = [first]
    if (nextRe) {
      const line = above.filter((w) => Math.abs(w.cy - first.cy) < first.h && w.l >= first.l).sort((x, y) => x.l - y.l)
      const end = line.findIndex((w) => nextRe.test(w.text))
      if (end < 0) continue // another label that happens to start with the same word
      label = line.slice(0, end + 1).filter((w) => !/^[*"]+$/.test(w.text))
    }
    return textOf(belowLabel(words, label, first.h * 4), '')
  }
  return ''
}

/** front / rear per row. With one meter everything is front. With two, the rows' magnitudes split into a low and a high
 *  group (the registers differ by orders of magnitude); the group nearer the front header number is the front meter. */
function assignMeters(sheet: ExtractedTruckSheet): void {
  const withMeter = sheet.readings.filter((r) => r.meter_start || r.meter_end)
  for (const r of withMeter) r.meter = 'front'
  if (!sheet.rear_meter_start || !sheet.front_meter_start || withMeter.length === 0) return
  const lg = (v: string) => Math.log10((Number.parseFloat(v) || 0) + 1)
  const front = lg(sheet.front_meter_start)
  const rear = lg(sheet.rear_meter_start)
  const vals = withMeter.map((r) => lg(r.meter_start || r.meter_end)).sort((a, b) => a - b)
  let cut: number | null = null
  let gap = 0.5 // smaller log gaps (a factor of about 3) are just one register
  for (let i = 1; i < vals.length; i++)
    if (vals[i] - vals[i - 1] > gap) {
      gap = vals[i] - vals[i - 1]
      cut = (vals[i] + vals[i - 1]) / 2
    }
  // Two groups: the one whose typical size is nearer the front header number is the front meter (the rear header is
  // often scribbled over, so it is only used when there is a single group).
  const hi = median(vals.filter((v) => cut != null && v > cut))
  const lo = median(vals.filter((v) => cut != null && v < cut))
  const frontIsHigh = Math.abs(hi - front) < Math.abs(lo - front)
  for (const r of withMeter) {
    const v = lg(r.meter_start || r.meter_end)
    if (cut == null) r.meter = Math.abs(v - rear) < Math.abs(v - front) ? 'rear' : 'front'
    else r.meter = (v > cut) === frontIsHigh ? 'front' : 'rear'
  }
}

/** A row with no meter whose remaining went UP by exactly its gallons is fuel added to the truck (tank fill or a transfer in). */
function inferAddedFuel(sheet: ExtractedTruckSheet): void {
  let prev = Number.parseFloat(sheet.starting_gallons)
  for (const r of sheet.readings) {
    const rem = Number.parseFloat(r.gallons_remaining)
    const g = Number.parseFloat(r.gallons_pumped)
    if (r.reading_type === 'fueling' && !r.meter_start && !r.meter_end && [prev, rem, g].every(Number.isFinite)) {
      if (Math.abs(rem - (prev + g)) < 0.55 && Math.abs(rem - (prev - g)) >= 0.55) {
        const truckNo = /^\d{4}$/.test(r.tail_number)
        r.reading_type = truckNo ? 'transfer_in' : 'tank_fill'
        if (!truckNo && /^[5S]\d$/i.test(r.customer)) r.customer = `T${r.customer[1]}`
      }
    }
    prev = rem
  }
}

// ---------- main ----------

export function parseJetA(page: OcrPage): ExtractedTruckSheet {
  const empty: ExtractedTruckSheet = {
    sheet_date: null,
    truck_number: '',
    fuel_type: '',
    gallons_down: '',
    starting_gallons: '',
    front_meter_start: '',
    rear_meter_start: '',
    fueler_initials: '',
    readings: []
  }
  if (page.words.length < 10) return empty
  const words = uprightWords(page)

  // fuel type: the big title "Jet A" / "Avgas"
  const title = words.filter((w) => /^(jet|avgas)$/i.test(w.text))
  let fuel: ExtractedTruckSheet['fuel_type'] = ''
  const medH = median(words.map((w) => w.h))
  for (const t of title) {
    if (t.h < medH * 1.3) continue
    fuel = /avgas/i.test(t.text) ? 'avgas' : 'jet_a'
  }

  const found = findRows(words)
  const limit = found ? found.rows[0] - ROW_ABOVE * found.pitch - found.pitch : median(words.map((w) => w.cy)) * 0.5

  // header boxes (above the table, so they are found by label)
  const month = digitsOf(headerValue(words, /^month$/i, limit))
  const day = digitsOf(headerValue(words, /^day$/i, limit))
  const year = digitsOf(headerValue(words, /^year$/i, limit))
  const truck = digitsOf(headerValue(words, /^truck$/i, limit, /^no\.?$/i))
  const down = digitsOf(headerValue(words, /^gallons$/i, limit, /^down$/i))
  const front = digitsOf(headerValue(words, /^\*?front$/i, limit, /^number$/i))
  const rear = digitsOf(headerValue(words, /^\*?rear$/i, limit, /^number$/i))
  const init = headerValue(words, /^init$/i, limit)
  const m = Number(month)
  const d = Number(day)
  const y = Number(year)
  const sheetDate =
    m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100
      ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : null

  const sheet: ExtractedTruckSheet = {
    ...empty,
    sheet_date: sheetDate,
    truck_number: truck,
    fuel_type: fuel,
    gallons_down: down,
    front_meter_start: front,
    rear_meter_start: rear,
    fueler_initials: init.toUpperCase().replace(/[^A-Z]/g, '')
  }

  if (!found) return sheet
  const { rows, pitch, yesX } = found
  const top0 = rows[0] - ROW_ABOVE * pitch
  const map = fitMap(headerAnchors(words, top0, pitch, yesX))
  if (!map) return sheet
  const bounds = REF_BOUNDS.map(map)

  const rowTop = (i: number) => rows[i] - ROW_ABOVE * pitch
  const body = splitAcrossColumns(
    words.filter((w) => w.cy >= top0 - 0.8 * pitch && w.cy < rows[rows.length - 1] + ROW_BELOW * pitch),
    bounds
  ).filter(
    (w, i, all) =>
      !all.some((o, j) => j < i && o.text === w.text && Math.abs(o.cx - w.cx) < (w.r - w.l) * 0.6 && Math.abs(o.cy - w.cy) < w.h * 1.2)
  )
  const rowIndex = (y: number) => {
    for (let i = 0; i < rows.length; i++) if (y >= rows[i] - ROW_ABOVE * pitch && y < rows[i] + ROW_BELOW * pitch) return i
    return -1
  }

  // shaded starting-gallons band above the first row
  sheet.starting_gallons = numberOf(
    body.filter((w) => w.cy < top0 && colOf(w.cx, bounds) === 'starting' && /^[0-9OoSIlBZ]{3,}$/.test(w.text))
  )

  const PRINTED = /^(gals?|remaining|prist\??|\?|yes|no|\(|\)|circle|one|\.|↓)$/i
  const cells: Array<Record<Col, UWord[]>> = rows.map(() => ({} as Record<Col, UWord[]>))
  for (const c of cells) for (const col of COLS) c[col] = []
  for (const w of body) {
    const i = rowIndex(w.cy)
    if (i < 0) continue
    const col = colOf(w.cx, bounds)
    if (col === 'yes') continue
    if ((col === 'starting' || col === 'prist') && (PRINTED.test(w.text) || w.cy < rows[i] + 0.02 * pitch)) continue
    cells[i][col].push(w)
  }

    for (let i = 0; i < rows.length; i++) {
    const c = cells[i]
    let customer = textOf(c.customer, ' ')
    let tail = textOf(c.tail, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    let type = textOf(c.type, '').toUpperCase().replace(/\s+/g, '')
    // "Xfer to 8370" is often written across the customer, tail and type boxes: rebuild it from all three.
    const spill = [...c.customer, ...c.tail, ...c.type].sort((x, y) => x.cx - y.cx)
    const spillText = spill.map((w) => w.text).join('').toLowerCase()
    if (/^x-?(fer)?(from|to|in|out)/.test(spillText)) {
      customer = spill.filter((w) => /\D/.test(w.text)).map((w) => w.text).join(' ')
      tail = spill.map((w) => w.text).join('').replace(/\D/g, '')
      type = ''
    }
    const meterStart = numberOf(c.start)
    const meterEnd = numberOf(c.end)
    const pumped = numberOf(c.gallons)
    const remaining = numberOf(c.starting)
    if (!customer && !tail && !meterStart && !meterEnd && !pumped) continue

    const inv = c.invoice.filter((w) => w.cy < rows[i] + 0.1 * pitch)
    const tm = c.invoice.filter((w) => w.cy >= rows[i] + 0.1 * pitch)
    let invoice = textOf(inv, '').replace(/[^0-9A-Za-z-]/g, '').replace(/^-+$/, '')
    let time = normTime(textOf(tm, ''))
    if (!time && isTime(invoice)) {
      time = invoice
      invoice = ''
    }

    let req = textOf(c.prist, '').toUpperCase().replace(/\s+/g, '')
    if (/^(T[/\\|]?[O0]|TO)$/.test(req)) req = 'T/O'
    const tech = textOf(c.tech, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

    const notes: string[] = []
    const lowConf = [...c.start, ...c.end, ...c.gallons, ...c.starting].filter((w) => w.conf < 0.5)
    if (lowConf.length) notes.push('low OCR confidence on a number')
    if (classify(customer) === 'fueling' && tail && /^\d/.test(tail) && !/^\d{4}$/.test(tail)) notes.push('tail number has no registration prefix')
    if (tech && !/^[A-Z]{2}$/.test(tech)) notes.push(`initials read as "${tech}"`)
    if (time && !isTime(time)) notes.push(`time "${time}" is not a valid 24h time`)

    const reading: ExtractedReading = {
      reading_type: classify(customer),
      customer,
      tail_number: tail,
      aircraft_type: type,
      fuel_type_confirmed: true,
      meter: '',
      meter_start: meterStart,
      meter_end: meterEnd,
      gallons_pumped: pumped,
      gallons_remaining: remaining,
      prist: '',
      req_gals_or_lbs: req,
      line_tech_initials: tech,
      invoice_number: invoice,
      service_time: time,
      notes: ''
    }
    if (notes.length) {
      reading.needs_review = true
      reading.review_notes = notes.join('; ')
    }
    sheet.readings.push(reading)
  }

  assignMeters(sheet)
  inferAddedFuel(sheet)
  repairArithmetic(sheet)
  return sheet
}
