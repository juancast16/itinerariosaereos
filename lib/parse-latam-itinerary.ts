import { detectAirlineFromText, findKnownFlightNumbers } from '@/lib/airline-codes'
import { formatCityLabel } from '@/lib/city-keys'
import { FlightSegment } from '@/lib/types'

const LATAM_CITY_PATTERNS: { re: RegExp; city: string }[] = [
  { re: /\bcartagena(?:\s+de\s+indias)?/gi, city: 'CARTAGENA' },
  { re: /\bbogota/gi, city: 'BOGOTA' },
  { re: /\bcali\b/gi, city: 'CALI' },
  { re: /\bmedellin/gi, city: 'MEDELLIN' },
  { re: /\bsan\s+andres/gi, city: 'SAN ANDRES' },
  { re: /\bbarranquilla/gi, city: 'BARRANQUILLA' },
  { re: /\bsantiago/gi, city: 'SANTIAGO' },
  { re: /\blima\b/gi, city: 'LIMA' },
]

function normalizeText(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Normaliza horas OCR: "7.50" → "7:50", quita ruido "0.m." */
function normalizeLatamOcrTimes(text: string) {
  return text
    .replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2')
    .replace(/\b\d\.?\s*m\.?\b/gi, ' ')
}

export function isLatamItineraryFormat(text: string) {
  const n = normalizeText(text)
  const laFlights = findKnownFlightNumbers(text).some(f => f.flightNumber.startsWith('LA'))

  const hasLatamDoc =
    n.includes('informacion de tu viaje') ||
    n.includes('codigo de reserva') ||
    (n.includes('itinerario') && laFlights) ||
    (n.includes('latam') && laFlights)

  const hasTableHints =
    (n.includes('origen') && n.includes('destino')) ||
    (n.includes('salida') && n.includes('llegada')) ||
    /\b\d{2}\/\d{2}\/\d{2,4}\b/.test(text)

  return hasLatamDoc && laFlights && (hasTableHints || n.includes('informacion de tu viaje'))
}

function parseLatamDate(value: string) {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (!m) return ''
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${m[1]}/${m[2]}/${y}`
}

function parseLatamTime12(raw: string) {
  const m = raw.match(/(\d{1,2})[:\.](\d{2})/i)
  if (!m) return ''

  let hour = Number(m[1])
  const minute = m[2]
  const marker = raw.toLowerCase()

  if (/p\.?\s*m/.test(marker) && hour < 12) hour += 12
  if (/a\.?\s*m/.test(marker) && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}`
}

function stripAccents(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function extractCitiesInBlock(block: string) {
  const searchBlock = stripAccents(block)
  const found: { index: number; city: string }[] = []

  for (const { re, city } of LATAM_CITY_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(searchBlock)) !== null) {
      found.push({ index: m.index, city })
    }
  }

  found.sort((a, b) => a.index - b.index)

  const cities: string[] = []
  for (const { city } of found) {
    if (cities.length === 0 || cities[cities.length - 1] !== city) {
      cities.push(city)
    }
  }

  return cities
}

function orderCitiesForConnection(cities: string[], previousDestination?: string) {
  if (cities.length < 2 || !previousDestination) return cities

  const prev = previousDestination.toUpperCase()
  if (cities[0] === prev) return cities
  if (cities[1] === prev) return [cities[1], cities[0]]
  return cities
}

function extractLatamTimes(block: string) {
  const normalized = normalizeLatamOcrTimes(block)
  const times: string[] = []
  const regex = /\b(\d{1,2}[:\.]\d{2})(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))?\b/gi
  let m: RegExpExecArray | null

  while ((m = regex.exec(normalized)) !== null) {
    const raw = m[0]
    if (/^0[:\.]/.test(raw)) continue
    const value = parseLatamTime12(raw)
    if (value && !times.includes(value)) times.push(value)
  }

  return times
}

function extractLatamDates(block: string) {
  const dates: string[] = []
  const regex = /\b(\d{2}\/\d{2}\/\d{2,4})\b/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(block)) !== null) {
    const d = parseLatamDate(m[1])
    if (d && !dates.includes(d)) dates.push(d)
  }
  return dates
}

function parseLatamPassengers(text: string) {
  const passengers: { fullName: string }[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (!/\|\s*adulto\s*\|/i.test(line) && !/\|\s*adulto\s*$/i.test(line)) continue

    const parts = line.split('|').map(p => p.trim())
    const name = parts[0]?.replace(/^\d+\s*/, '')
    if (!name || /nombre|pasajero|tipo|documento/i.test(name)) continue
    if (name.length < 4) continue

    passengers.push({ fullName: name.replace(/\s+/g, ' ').trim() })
  }

  if (passengers.length > 0) return passengers

  for (let i = 0; i < lines.length; i++) {
    if (!/^adulto$/i.test(normalizeText(lines[i]))) continue
    const name = lines[i - 1]
    if (!name || /nombre|pasajero|tipo|documento|itinerario|orden|reserva/i.test(name)) continue
    if (name.length < 4 || /\d{5,}/.test(name)) continue
    if (/^[A-Z0-9]{5,7}$/.test(name)) continue

    passengers.push({ fullName: name.replace(/\s+/g, ' ').trim() })
  }

  return passengers
}

function parseLatamBookingCode(text: string) {
  const n = normalizeText(text)
  const inline = n.match(/codigo de reserva\s*:?\s*([a-z0-9]{5,7})/i)
  if (inline) return inline[1].toUpperCase()

  const lines = text.split('\n').map(l => l.trim())
  for (let i = 0; i < lines.length; i++) {
    if (!/codigo de reserva/i.test(normalizeText(lines[i]))) continue
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const code = lines[j]
      if (/^[A-Z0-9]{5,7}$/i.test(code)) return code.toUpperCase()
    }
  }

  return ''
}

function latamItineraryStart(text: string) {
  const idx = text.search(/itinerario/i)
  return idx >= 0 ? idx : 0
}

function parseLatamFlightBlock(
  header: string,
  flightNumber: string,
  bookingCode: string,
  previousDestination?: string
): FlightSegment | null {
  const block = normalizeLatamOcrTimes(header)
  let cities = extractCitiesInBlock(block)
  cities = orderCitiesForConnection(cities, previousDestination)
  if (cities.length < 2) return null

  const times = extractLatamTimes(block)
  const dates = extractLatamDates(block)

  const flight: FlightSegment = {
    segment: 0,
    airline: 'LATAM',
    flightNumber,
    origin: formatCityLabel(cities[0]),
    destination: formatCityLabel(cities[1]),
    date: dates[0] || '',
    departureTime: times[0] || '',
    arrivalTime: times[1] || '',
    bookingCode,
  }

  if (
    flight.departureTime &&
    flight.arrivalTime &&
    flight.arrivalTime < flight.departureTime &&
    flight.date
  ) {
    flight.arrivalNextDay = true
    const [d, m, y] = flight.date.split('/').map(Number)
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + 1)
      flight.arrivalDate =
        `${String(dt.getDate()).padStart(2, '0')}/` +
        `${String(dt.getMonth() + 1).padStart(2, '0')}/` +
        `${dt.getFullYear()}`
    }
  }

  return flight
}

export function parseLatamItinerary(text: string) {
  const normalized = normalizeLatamOcrTimes(text)
  const bookingCode = parseLatamBookingCode(text)
  const passengers = parseLatamPassengers(text)
  const flightMatches = findKnownFlightNumbers(normalized).filter(f =>
    f.flightNumber.startsWith('LA')
  )

  const flights: FlightSegment[] = []
  let previousDestination: string | undefined

  for (let i = 0; i < flightMatches.length; i++) {
    const { flightNumber, index } = flightMatches[i]
    const headerStart =
      i === 0
        ? latamItineraryStart(normalized)
        : flightMatches[i - 1].index + flightMatches[i - 1].flightNumber.length
    const header = normalized.slice(headerStart, index)
    const tailEnd =
      i + 1 < flightMatches.length ? flightMatches[i + 1].index : normalized.length
    const tail = normalized.slice(index + flightNumber.length, tailEnd)
    const block = `${header}\n${tail}`

    const flight = parseLatamFlightBlock(block, flightNumber, bookingCode, previousDestination)
    if (flight) {
      flight.segment = flights.length + 1
      flights.push(flight)
      previousDestination = flight.destination
    }
  }

  const bookingCodes = bookingCode
    ? [{ airline: 'LATAM', code: bookingCode }]
    : []

  return {
    flights,
    passengers: passengers.length > 0 ? passengers : [{ fullName: '' }],
    bookingCodes,
    hints: [] as string[],
  }
}

export function tryParseLatamItinerary(text: string) {
  if (!isLatamItineraryFormat(text)) return null
  const parsed = parseLatamItinerary(text)
  if (parsed.flights.length === 0) return null
  if (!detectAirlineFromText(text) && !parsed.flights.some(f => f.flightNumber.startsWith('LA'))) {
    return null
  }
  return parsed
}
