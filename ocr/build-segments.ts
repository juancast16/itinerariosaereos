import { detectCity, parseDate } from './normalize'

export function buildSegments(lines: string[]) {
  const flights: any[] = []
  let current: any = null

  for (const line of lines) {

    // RUTA
    if (line.includes('-')) {
      const origin = detectCity(line.split('-')[0])
      const destination = detectCity(line.split('-')[1] || '')

      if (origin && destination && origin !== destination) {
        if (current) flights.push(current)

        current = {
          airline: null,
          flightNumber: null,
          origin,
          destination,
          date: parseDate(line),
          departureTime: null,
          arrivalTime: null
        }
        continue
      }
    }

    if (!current) continue

    // HORAS
    const timeMatch = line.match(/(\d{2}:\d{2})\s+([A-Z]{3})/)
    if (timeMatch) {
      if (timeMatch[2] === current.origin) current.departureTime = timeMatch[1]
      if (timeMatch[2] === current.destination) current.arrivalTime = timeMatch[1]
    }

    // AEROLÍNEA + VUELO
    const flightMatch = line.match(/([A-Za-z]+)\s+([A-Z]{2}\d{2,4})/)
    if (flightMatch) {
      current.airline = flightMatch[1]
      current.flightNumber = flightMatch[2]
    }

    // FECHA SUELTA
    if (!current.date) {
      const d = parseDate(line)
      if (d) current.date = d
    }
  }

  if (current) flights.push(current)

  return flights.filter(f =>
    f.origin && f.destination &&
    (f.flightNumber || f.airline) &&
    (f.departureTime || f.arrivalTime)
  )
}
