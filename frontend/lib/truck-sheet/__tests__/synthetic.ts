// Builds a synthetic Cloud Vision page for the Jet v4 form (no customer data): printed header words, the "Circle" label
// of 12 rows and whatever handwriting a test places, optionally rotated/tilted like a phone photo.
import type { OcrPage, OcrWord } from '../types'

interface Box {
  text: string
  cx: number
  cy: number
  h?: number
  conf?: number
}

// column -> x centre of handwriting (upright page units; the parser fits the layout, so only proportions matter)
export const COL_X = { customer: 300, tail: 600, type: 800, start: 1200, end: 1560, gallons: 1800, starting: 2050, prist: 2250, tech: 2500, invoice: 2780 }
export const ROW0 = 660
export const PITCH = 130
export const rowY = (i: number) => ROW0 + i * PITCH

function toWord(b: Box, degrees: number, scale = 1): OcrWord {
  const h = b.h ?? 26
  const w = Math.max(b.text.length, 1) * 14
  const corners = [
    [b.cx - w / 2, b.cy - h / 2],
    [b.cx + w / 2, b.cy - h / 2],
    [b.cx + w / 2, b.cy + h / 2],
    [b.cx - w / 2, b.cy + h / 2]
  ]
  const a = (degrees * Math.PI) / 180
  const pts = corners.map(([x, y]) => ({
    x: (x * Math.cos(a) - y * Math.sin(a)) * scale + 4000,
    y: (x * Math.sin(a) + y * Math.cos(a)) * scale + 4000
  }))
  return { text: b.text, confidence: b.conf ?? 0.95, box: pts as OcrWord['box'] }
}

export function headerBoxes(opts: { month?: string; day?: string; year?: string; truck?: string; down?: string; front?: string; rear?: string; init?: string } = {}): Box[] {
  const o = { month: '8', day: '19', year: '2026', truck: '5282', down: '0', front: '12893511', rear: '', init: 'TT', ...opts }
  const boxes: Box[] = [
    { text: 'Month', cx: 300, cy: 100 }, { text: 'Day', cx: 450, cy: 100 }, { text: 'Year', cx: 600, cy: 100 },
    { text: 'Truck', cx: 800, cy: 100 }, { text: 'No.', cx: 860, cy: 100 },
    { text: 'Gallons', cx: 1300, cy: 100 }, { text: 'Down', cx: 1380, cy: 100 },
    { text: 'Jet', cx: 1000, cy: 60, h: 70 }, { text: 'A', cx: 1070, cy: 60, h: 70 },
    { text: '*Front', cx: 1700, cy: 100 }, { text: 'meter', cx: 1790, cy: 100 }, { text: 'starting', cx: 1900, cy: 100 }, { text: 'number', cx: 2000, cy: 100 },
    { text: 'Rear', cx: 2150, cy: 100 }, { text: 'meter', cx: 2250, cy: 100 }, { text: 'starting', cx: 2350, cy: 100 }, { text: 'number', cx: 2450, cy: 100 },
    { text: 'Init', cx: 2650, cy: 100 },
    // column headers
    { text: 'Customer', cx: 267, cy: 490 }, { text: 'Number', cx: 548, cy: 490 }, { text: 'Type', cx: 811, cy: 490 },
    { text: 'Start', cx: 1219, cy: 490 }, { text: 'End', cx: 1585, cy: 490 }, { text: 'Pumped', cx: 1828, cy: 490 },
    { text: 'Starting', cx: 2032, cy: 455 }, { text: 'Req', cx: 2208, cy: 490 }, { text: 'Initials', cx: 2519, cy: 490 }, { text: 'Invoice', cx: 2700, cy: 455 }
  ]
  const values: Array<[string, number]> = [[o.month, 300], [o.day, 450], [o.year, 600], [o.truck, 830], [o.down, 1340], [o.front, 1850], [o.rear, 2300], [o.init, 2650]]
  for (const [text, cx] of values) if (text) boxes.push({ text, cx, cy: 150 })
  return boxes
}

/** Printed per-row labels: "Circle" in the fuel-type column, plus "Gals. Remaining" and "Prist? Yes No" above the writing. */
export function rowLabels(rows = 12): Box[] {
  const boxes: Box[] = []
  for (let i = 0; i < rows; i++) {
    boxes.push({ text: 'Circle', cx: 943, cy: rowY(i) }, { text: 'YES', cx: 943, cy: rowY(i) + 40 })
    boxes.push({ text: 'Gals.', cx: 2000, cy: rowY(i) - 5 }, { text: 'Remaining', cx: 2080, cy: rowY(i) - 5 })
    boxes.push({ text: 'Prist?', cx: 2200, cy: rowY(i) - 5 }, { text: 'Yes', cx: 2260, cy: rowY(i) - 5 }, { text: 'No', cx: 2320, cy: rowY(i) - 5 })
  }
  return boxes
}

export type Hand = Partial<Record<keyof typeof COL_X, string>> & { time?: string }

/** Handwriting of one row. A multi-word value is placed word by word; `time` goes on the bottom line of the invoice cell. */
export function hand(row: number, h: Hand): Box[] {
  const y = rowY(row) + 38
  const boxes: Box[] = []
  for (const col of Object.keys(COL_X) as Array<keyof typeof COL_X>) {
    const text = h[col]
    if (!text) continue
    boxes.push({ text, cx: COL_X[col], cy: col === 'invoice' ? rowY(row) - 20 : y })
  }
  if (h.time) boxes.push({ text: h.time, cx: COL_X.invoice, cy: y })
  return boxes
}

export function page(boxes: Box[], degrees = 0): OcrPage {
  return { width: 8000, height: 8000, words: boxes.map((b) => toWord(b, degrees)) }
}

export function sheetBoxes(rows: Hand[], header: Parameters<typeof headerBoxes>[0] = {}, starting = '5000'): Box[] {
  return [
    ...headerBoxes(header),
    ...rowLabels(),
    ...(starting ? [{ text: starting, cx: COL_X.starting, cy: ROW0 - 70 }] : []),
    ...rows.flatMap((r, i) => hand(i, r))
  ]
}
