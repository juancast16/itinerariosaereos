import { FlightSegment } from '@/lib/types'

function parseDateKeepingFormat(date: string): {
  parsed: Date | null
  format: 'ymd' | 'dmy' | null
} {
  if (!date) return { parsed: null, format: null }

  if (date.includes('-')) {
    const [year, month, day] = date.split('-').map(Number)
    if (!year || !month || !day) return { parsed: null, format: 'ymd' }
    return { parsed: new Date(year, month - 1, day), format: 'ymd' }
  }

  if (date.includes('/')) {
    const [day, month, year] = date.split('/').map(Number)
    if (!year || !month || !day) return { parsed: null, format: 'dmy' }
    return { parsed: new Date(year, month - 1, day), format: 'dmy' }
  }

  return { parsed: null, format: null }
}

function formatDateWithOriginalStyle(date: Date, format: 'ymd' | 'dmy' | null): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  if (format === 'dmy') return `${day}/${month}/${year}`
  return `${year}-${month}-${day}`
}

export function enrichFlightsWithArrivalDay(flights: FlightSegment[]): FlightSegment[] {
  return flights.map((flight) => {
    const departure = flight.departureTime
    const arrival = flight.arrivalTime

    if (!departure || !arrival || arrival >= departure) {
      return {
        ...flight,
        arrivalNextDay: false,
        arrivalDate: undefined
      }
    }

    const { parsed, format } = parseDateKeepingFormat(flight.date)

    if (!parsed) {
      return {
        ...flight,
        arrivalNextDay: true,
        arrivalDate: undefined
      }
    }

    parsed.setDate(parsed.getDate() + 1)

    return {
      ...flight,
      arrivalNextDay: true,
      arrivalDate: formatDateWithOriginalStyle(parsed, format)
    }
  })
}
