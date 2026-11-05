// Per-field accuracy of a parsed sheet against a hand-made ground truth (test helper; holds no sheet data).
import type { ExtractedReading, ExtractedTruckSheet } from '../types'

const HEADER_FIELDS = [
  'sheet_date',
  'truck_number',
  'fuel_type',
  'gallons_down',
  'starting_gallons',
  'front_meter_start',
  'rear_meter_start',
  'fueler_initials'
] as const
const ROW_FIELDS = [
  'reading_type',
  'customer',
  'tail_number',
  'aircraft_type',
  'meter',
  'meter_start',
  'meter_end',
  'gallons_pumped',
  'gallons_remaining',
  'req_gals_or_lbs',
  'line_tech_initials',
  'invoice_number',
  'service_time'
] as const

export type TruthSheet = Partial<Omit<ExtractedTruckSheet, 'readings'>> & { readings: Partial<ExtractedReading>[] }

const norm = (v: unknown) => String(v ?? '').toUpperCase().replace(/\s+/g, '')

export interface FieldScore {
  field: string
  correct: number
  total: number
  wrong: string[]
}

export function compareToTruth(got: ExtractedTruckSheet, truth: TruthSheet): { fields: FieldScore[]; rowsGot: number; rowsTruth: number } {
  const score = new Map<string, FieldScore>()
  const hit = (field: string, ok: boolean, detail: string) => {
    const s = score.get(field) ?? { field, correct: 0, total: 0, wrong: [] }
    s.total++
    if (ok) s.correct++
    else s.wrong.push(detail)
    score.set(field, s)
  }
  for (const f of HEADER_FIELDS) {
    if (truth[f] === undefined) continue
    hit(`header.${f}`, norm(got[f]) === norm(truth[f]), `want "${truth[f]}" got "${got[f]}"`)
  }
  truth.readings.forEach((t, i) => {
    const g = got.readings[i]
    for (const f of ROW_FIELDS) {
      if (t[f] === undefined) continue
      hit(`row.${f}`, !!g && norm(g[f]) === norm(t[f]), `row ${i + 1}: want "${t[f]}" got "${g?.[f] ?? '(no row)'}"`)
    }
  })
  return { fields: [...score.values()], rowsGot: got.readings.length, rowsTruth: truth.readings.length }
}

export function formatScores(label: string, r: ReturnType<typeof compareToTruth>): string {
  const lines = [`== ${label}: rows read ${r.rowsGot}, expected ${r.rowsTruth}`]
  let c = 0
  let t = 0
  for (const f of r.fields) {
    c += f.correct
    t += f.total
    lines.push(`${f.field.padEnd(26)} ${f.correct}/${f.total}${f.wrong.length ? `   ${f.wrong.join(' | ')}` : ''}`)
  }
  lines.push(`TOTAL ${c}/${t} = ${((100 * c) / Math.max(t, 1)).toFixed(1)}%`)
  return lines.join('\n')
}
