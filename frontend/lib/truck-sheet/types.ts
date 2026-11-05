// Shared shapes for the free truck-sheet reader (Cloud Vision words in, ExtractedTruckSheet out).

export interface Point {
  x: number
  y: number
}

/** One word from Cloud Vision: text, confidence 0-1 and its 4 corner points in image pixels. The first corner is the
 *  top-left of the word as the text reads, so corner 0 -> 1 points along the reading direction (this is what lets us
 *  detect a rotated page). */
export interface OcrWord {
  text: string
  confidence: number
  box: [Point, Point, Point, Point]
}

export interface OcrPage {
  width: number
  height: number
  words: OcrWord[]
}

export type ExtractedReadingType = 'fueling' | 'tank_fill' | 'transfer_in' | 'transfer_out' | 'other'

export interface ExtractedReading {
  reading_type: ExtractedReadingType
  customer: string
  tail_number: string
  aircraft_type: string
  fuel_type_confirmed: boolean
  meter: 'front' | 'rear' | ''
  meter_start: string
  meter_end: string
  gallons_pumped: string
  gallons_remaining: string
  prist: 'yes' | 'no' | ''
  req_gals_or_lbs: string
  line_tech_initials: string
  invoice_number: string
  service_time: string
  notes: string
  /** Set by the free OCR reader: the row failed an arithmetic check or has a doubtful cell; see review_notes. */
  needs_review?: boolean
  review_notes?: string
}

export interface ExtractedTruckSheet {
  sheet_date: string | null // "YYYY-MM-DD" if visible
  truck_number: string // e.g. "5282"
  fuel_type: 'jet_a' | 'avgas' | ''
  gallons_down: string
  starting_gallons: string
  front_meter_start: string
  rear_meter_start: string
  fueler_initials: string
  readings: ExtractedReading[]
  raw_text?: string // for debugging
  /** Clockwise quarter turn that makes the page upright (0 when the reader could not tell, see rotation_confident). */
  rotation_degrees?: 0 | 90 | 180 | 270
  /** False when rotation_degrees is only a default 0 because the page orientation could not be judged. */
  rotation_confident?: boolean
}
