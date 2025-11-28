export interface QTDispatch {
  DispatchID?: string
  FlightNumber: string
  TailNumber: string
  AirlineName: string
  AircraftType?: string
  Origin?: string
  Destination: string
  FlightStatus: 'In' | 'In Flight' | 'Planned' | 'Completed'
  Quantity: number // gallons
  QuantityInWeight: number // lbs
  DepartureDate?: string
  ArrivalDate?: string
  ChangeFlags?: number
}

export interface QTConfig {
  username: string
  password: string
  companyLocationId: string
  userId: string
  vapidPublicKey?: string
}

export interface QTDispatchChange {
  type: 'new_flight' | 'dispatch_update' | 'fuel_request' | 'status_change'
  flight: QTDispatch
  message: string
  oldChangeFlags?: number
  newChangeFlags?: number
}
