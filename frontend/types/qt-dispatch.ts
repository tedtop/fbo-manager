// Shape of QT Technologies' GetDispatchDetail dispatches. Dates are "YYYY-MM-DD HH:mm" in the
// airport's local time (no zone); QT uses placeholder strings such as "Unknown" for unset values.
export interface QTDispatch {
  TransactionID?: number | string
  FlightID?: number | string
  FlightNumber: string
  TailNumber: string
  AirlineName: string
  AirlineIcaoCode?: string
  AircraftType?: string
  Origin?: string
  Destination: string
  FlightStatus: 'In' | 'In Flight' | 'Planned' | 'Completed'
  Quantity: number // gallons
  QuantityInWeight: number // lbs
  DepartureDate?: string
  ArrivalDate?: string
  TimeOnGround?: string
  Gate?: string
  TerminalNumber?: string
  MEL?: boolean
  MELMessage?: string
  ChangeFlags?: number
}
