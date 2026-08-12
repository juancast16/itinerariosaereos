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

/** Minutos desde 00:00; evita comparar "6:15" vs "22:30" como strings. */
function timeToMinutes(time: string): number | null {
  const match = (time || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function arrivesNextCalendarDay(flight: FlightSegment): boolean {
  if (flight.arrivalNextDay) return true

  const departure = timeToMinutes(flight.departureTime)
  const arrival = timeToMinutes(flight.arrivalTime)
  if (departure === null || arrival === null) return false

  // Si la hora de llegada es menor que la de salida, cruzó medianoche.
  return arrival < departure
}

export function enrichFlightsWithArrivalDay(flights: FlightSegment[]): FlightSegment[] {
  return flights.map((flight) => {
    if (!arrivesNextCalendarDay(flight)) {
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
        arrivalDate: flight.arrivalDate
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
