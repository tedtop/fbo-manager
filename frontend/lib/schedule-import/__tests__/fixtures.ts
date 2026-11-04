// Inline fixture data for the schedule import tests: no network, no API key, no files on disk.
import type { ExtractedScheduleRow } from '../types'

export function row(overrides: Partial<ExtractedScheduleRow> = {}): ExtractedScheduleRow {
  return {
    tail_number: 'N116FE',
    aircraft_type: 'C525',
    customer: 'Acme Aviation',
    group_date: '',
    arrival_date: '',
    arrival_time: '',
    departure_date: '',
    departure_time: '',
    services: '',
    notes: '',
    raw_row_text: '',
    needs_review: false,
    confidence: 'high',
    page: 1,
    ...overrides
  }
}

// What the model might return for a sheet with day headings, before normalization (deliberately messy).
export const RAW_MODEL_JSON = {
  sheet_date: null,
  date_range_start: '11/05/2026',
  date_range_end: '2026-11-06',
  source_software_hint: '  FBO Desk Pro  ',
  rows: [
    {
      tail_number: 'N 116 FE',
      aircraft_type: 'c525',
      customer: 'Acme   Aviation',
      group_date: 'Thu 11/05',
      arrival_date: '',
      arrival_time: '0930',
      departure_date: '',
      departure_time: '5:45 PM',
      services: 'fuel, GPU',
      notes: '',
      raw_row_text: 'N 116 FE | C525 | Acme Aviation | 0930 | 5:45 PM',
      needs_review: false,
      confidence: 'high'
    },
    {
      tail_number: 'n-446-fm',
      aircraft_type: 'PC12',
      customer: 'Greg',
      group_date: '2026-11-06',
      arrival_time: 'TBD',
      departure_time: '06:15',
      notes: 'T/O top off',
      confidence: 'banana',
      page: 2
    },
    { tail_number: '', customer: '', arrival_time: '', departure_time: '' }, // blank decoration line: dropped
    'not an object'
  ]
}
