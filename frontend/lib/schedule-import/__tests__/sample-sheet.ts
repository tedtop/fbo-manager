// The extraction JSON the model is expected to return for docs/samples/schedule-sheet-2026-11-04.jpg ("Scheduled
// Arrivals and Requests", Minuteman Aviation Inc, one row per leg with an Action column). Inline fixture: no network.
import { normalizeScheduleSheet } from '../normalize'
import type { ExtractedScheduleSheet } from '../types'

const common = { group_date: '', confidence: 'high', needs_review: false }

export const SAMPLE_MODEL_JSON = {
  sheet_date: null,
  date_range_start: '2026-11-04',
  date_range_end: '2026-11-30',
  source_software_hint: 'Minuteman Aviation Inc - Scheduled Arrivals and Requests',
  rows: [
    {
      ...common,
      tail_number: 'N509CQ',
      aircraft_type: 'G-IVSP',
      customer: 'Cash/Check Customer',
      departure_date: '2026-11-04',
      departure_time: '10:00',
      services: '',
      notes: 'Service Duration - Short Stay; Confirmed 11/04/2026',
      raw_row_text: '11/04/2026 | 10:00 AM | Depart | N509CQ | G-IVSP | Cash/Check Customer | 11/04/2026'
    },
    {
      ...common,
      tail_number: 'N868CB',
      aircraft_type: 'CJ2',
      customer: 'Buybacks-Contract Fuel',
      arrival_date: '2026-11-04',
      arrival_time: '11:00',
      notes: 'Service Duration - Short Stay',
      raw_row_text: '11/04/2026 | 11:00 AM | Arrive | N868CB | CJ2 | Buybacks-Contract Fuel'
    },
    {
      ...common,
      tail_number: 'N868CB',
      aircraft_type: 'CJ2',
      customer: 'Buybacks-Contract Fuel',
      departure_date: '2026-11-04',
      departure_time: '12:00',
      notes: 'Service Duration - Short Stay',
      raw_row_text: '11/04/2026 | 12:00 PM | Depart | N868CB | CJ2 | Buybacks-Contract Fuel'
    },
    {
      ...common,
      tail_number: 'N33PX',
      aircraft_type: 'ENCORE',
      customer: 'Cash/Check Customer',
      departure_date: '2026-11-10',
      departure_time: '12:00',
      notes: 'Service Duration - Short Stay',
      raw_row_text: '11/10/2026 | 12:00 PM | Depart | N33PX | ENCORE | Cash/Check Customer'
    },
    {
      ...common,
      tail_number: 'N555HM',
      aircraft_type: 'BRAVO',
      customer: 'Cash/Check Customer',
      arrival_date: '2026-11-21',
      arrival_time: '12:14',
      services: 'Rental Car - Passenger: Sadler, Fullsize Hertz - Status: Confirmed',
      notes: 'Service Duration - Short Stay',
      raw_row_text: '11/21/2026 | 12:14 PM | Arrive | N555HM | BRAVO | Cash/Check Customer'
    },
    {
      ...common,
      tail_number: 'N555HM',
      aircraft_type: 'BRAVO',
      customer: 'Cash/Check Customer',
      departure_date: '2026-11-26',
      departure_time: '16:00',
      notes: 'Service Duration - Short Stay',
      raw_row_text: '11/26/2026 | 4:00 PM | Depart | N555HM | BRAVO | Cash/Check Customer'
    }
  ]
}

export const SAMPLE_SHEET: ExtractedScheduleSheet = normalizeScheduleSheet(SAMPLE_MODEL_JSON)
