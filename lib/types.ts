export interface Itinerary {
  passengers: {
    fullName: string
  }[]

  bookingCodes: {
    airline: string
    code: string
  }[]

  flights: FlightSegment[]

  baggage: {
    personalItem: boolean
    cabin10kg: boolean
    checked23kg: boolean
  }

  /** Avisos del parser (p. ej. falta captura expandida de escala). */
  hints?: string[]
}

export interface FlightSegment {
  segment: number

  airline: string
  flightNumber: string

  origin: string
  destination: string

  date: string
  departureTime: string

  arrivalTime: string
  arrivalNextDay?: boolean
  arrivalDate?: string

  bookingCode?: string
}
