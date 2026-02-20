// src/app/voucher/adapters/airline.ts

import { Itinerary, FlightSegment } from '@/lib/types'

interface AirlineRawData {
  bookingCode: string
  passengerName: string
  flights: FlightSegment[]
  remarks?: string[]
}

export function airlineAdapter(data: AirlineRawData): Itinerary {
 return {
  bookingCode: data.bookingCode,
  issueDate: new Date().toISOString(),
  channel: 'airline',

  passenger: {
    fullName: data.passengerName
  },

  flights: data.flights,

  baggage: {
    personalItem: true,
    cabin10kg: true,
    checked23kg: false
  },

  remarks: data.remarks || []
}

}
