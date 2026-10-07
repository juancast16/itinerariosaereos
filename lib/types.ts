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

  /**
   * Branding opcional. Si no viene o customAgency=false, se usa ConexionTrip
   * (logo, NIT, footer y textos legales actuales).
   */
  branding?: {
    customAgency?: boolean
    agencyName?: string
    /** data URL (image/png|jpeg|webp;base64,...) o vacío para sin logo */
    logoDataUrl?: string
  }
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

  /**
   * Cómo encaja este segmento respecto al anterior:
   * - auto: el PDF decide (escala / nuevo trayecto / vuelta)
   * - connection: forzar escala del trayecto anterior
   * - newTrip: forzar nuevo trayecto (vuelo extra)
   * - return: forzar viaje de vuelta
   */
  tripLink?: 'auto' | 'connection' | 'newTrip' | 'return'
}
