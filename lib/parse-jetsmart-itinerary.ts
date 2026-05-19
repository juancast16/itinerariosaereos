import {
  detectAirlineFromText,
  findKnownFlightNumbers,
  isJetSmartFlightNumber,
  normalizeFlightNumberSpacing,
} from '@/lib/airline-codes'
import { cityFromIata, formatCityLabel, KNOWN_IATA } from '@/lib/city-keys'
import { FlightSegment } from '@/lib/types'

const JETSMART_CITY_PATTERNS: { re: RegExp; city: string }[] = [
  { re: /\bbogota/gi, city: 'BOGOTA' },
  { re: /\bmedellin/gi, city: 'MEDELLIN' },
  { re: /\bcali\b/gi, city: 'CALI' },
  { re: /\bcartagena(?:\s+de\s+indias)?/gi, city: 'CARTAGENA' },
  { re: /\bbarranquilla/gi, city: 'BARRANQUILLA' },
  { re: /\bsanta\s+marta/gi, city: 'SANTA MARTA' },
  { re: /\bpereira/gi, city: 'PEREIRA' },
  { re: /\bcucuta/gi, city: 'CUCUTA' },
  { re: /\bmonteria/gi, city: 'MONTERIA' },
  { re: /\bsan\s+andres/gi, city: 'SAN ANDRES' },
  { re: /\bsantiago(?:\s+de\s+chile)?/gi, city: 'SANTIAGO' },
  { re: /\bantofagasta/gi, city: 'ANTOFAGASTA' },
  { re: /\bconcepcion/gi, city: 'CONCEPCION' },
  { re: /\blima\b/gi, city: 'LIMA' },
  { re: /\bbuenos\s+aires/gi, city: 'BUENOS AIRES' },
  { re: /\bquito/gi, city: 'QUITO' },
  { re: /\bguayaquil/gi, city: 'GUAYAQUIL' },
]

const MONTHS: Record<string, string> = {
  enero: '01',
  ene: '01',
  febrero: '02',
  feb: '02',
  marzo: '03',
  mar: '03',
  abril: '04',
  abr: '04',
  mayo: '05',
  may: '05',
  junio: '06',
  jun: '06',
  julio: '07',
  jul: '07',
  agosto: '08',
  ago: '08',
  septiembre: '09',
  sep: '09',
  setiembre: '09',
  octubre: '10',
  oct: '10',
  noviembre: '11',
  nov: '11',
  diciembre: '12',
  dic: '12',
}

function normalizeText(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function stripAccents(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeOcrTimes(text: string) {
  return text
    .replace(/\b(\d{1,2})\.(\d{2})\b/g, '$1:$2')
    .replace(/\b\d\.?\s*m\.?\b/gi, ' ')
}

function jetSmartFlightsInText(text: string) {
  return findKnownFlightNumbers(normalizeFlightNumberSpacing(text)).filter(f =>
    isJetSmartFlightNumber(f.flightNumber)
  )
}

export function isJetSmartItineraryFormat(text: string) {
  const n = normalizeText(text)
  const jsFlights = jetSmartFlightsInText(text)
  const hasBrand = n.includes('jetsmart') || n.includes('jet smart')
  const hasBookingHint =
    n.includes('localizador') ||
    n.includes('codigo de reserva') ||
    n.includes('tu reserva') ||
    n.includes('administra tu viaje') ||
    n.includes('confirmacion de compra') ||
    n.includes('confirmacion reserva') ||
    n.includes('detalle reserva')

  if (jsFlights.length > 0 && (hasBrand || hasBookingHint)) return true
  if (jsFlights.length >= 2 && n.includes('detalle reserva')) return true
  if (hasBrand && extractKnownIataCodes(text).length >= 2) return true
  if (hasBrand && /\b([a-z]{3,25})\s+a\s+([a-z]{3,25})\b/i.test(text)) return true

  return false
}

function parseJetSmartDate(value: string) {
  const slash = value.match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (slash) {
    const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return `${slash[1]}/${slash[2]}/${y}`
  }

  const v = normalizeText(value)
  const m = v.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})/)
  if (m) {
    const month = MONTHS[m[2]]
    if (month) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      return `${m[1].padStart(2, '0')}/${month}/${y}`
    }
  }

  return ''
}

function parseJetSmartTime12(raw: string) {
  const m = raw.match(/(\d{1,2})[:\.](\d{2})/i)
  if (!m) return ''

  let hour = Number(m[1])
  const minute = m[2]
  const marker = raw.toLowerCase()

  if (/p\.?\s*m/.test(marker) && hour < 12) hour += 12
  if (/a\.?\s*m/.test(marker) && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}`
}

function extractCitiesInBlock(block: string) {
  const searchBlock = stripAccents(block)
  const found: { index: number; city: string }[] = []

  for (const { re, city } of JETSMART_CITY_PATTERNS) {
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

function extractTimes(block: string) {
  const normalized = normalizeOcrTimes(block)
  const times: string[] = []

  const salida = normalized.match(/(?:hora\s+de\s+)?salida\s*:?\s*(\d{1,2}[:\.]\d{2})/i)
  const llegada = normalized.match(/(?:hora\s+de\s+)?llegada\s*:?\s*(\d{1,2}[:\.]\d{2})/i)
  if (salida) {
    const dep = parseJetSmartTime12(salida[1])
    if (dep) times.push(dep)
  }
  if (llegada) {
    const arr = parseJetSmartTime12(llegada[1])
    if (arr && !times.includes(arr)) times.push(arr)
  }
  if (times.length >= 2) return times

  const range = normalized.match(
    /(\d{1,2}[:\.]\d{2})\s*[-–]\s*(\d{1,2}[:\.]\d{2})/i
  )
  if (range) {
    const dep = parseJetSmartTime12(range[1])
    const arr = parseJetSmartTime12(range[2])
    if (dep) times.push(dep)
    if (arr && !times.includes(arr)) times.push(arr)
    if (times.length >= 2) return times
  }

  const regex = /\b(\d{1,2}[:\.]\d{2})(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))?\b/gi
  let m: RegExpExecArray | null

  while ((m = regex.exec(normalized)) !== null) {
    const raw = m[1]
    if (/^0[:\.]/.test(raw)) continue
    const value = parseJetSmartTime12(raw)
    if (value && !times.includes(value)) times.push(value)
  }

  return times
}

function extractSegmentDate(block: string) {
  const fecha = block.match(/fecha\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i)
  if (fecha) return parseJetSmartDate(fecha[1])
  return ''
}

function extractDates(block: string) {
  const segmentDate = extractSegmentDate(block)
  if (segmentDate) return [segmentDate]

  const dates: string[] = []

  const slash = /\b(\d{2}\/\d{2}\/\d{2,4})\b/g
  let m: RegExpExecArray | null
  while ((m = slash.exec(block)) !== null) {
    const d = parseJetSmartDate(m[1])
    if (d && !dates.includes(d)) dates.push(d)
  }

  const words = /\b(\d{1,2}\s+[a-z]{3,12}\s+\d{2,4})\b/gi
  while ((m = words.exec(block)) !== null) {
    const d = parseJetSmartDate(m[1])
    if (d && !dates.includes(d)) dates.push(d)
  }

  return dates
}

function extractKnownIataCodes(text: string) {
  const found: string[] = []
  const regex = /\b([A-Z]{3})\b/g
  let m: RegExpExecArray | null

  while ((m = regex.exec(text.toUpperCase())) !== null) {
    const code = m[1]
    if (KNOWN_IATA.has(code) && (found.length === 0 || found[found.length - 1] !== code)) {
      found.push(code)
    }
  }

  return found
}

/** Pares "Cali CLO" / "Santa Marta SMR" del email de confirmación. */
function extractCityIataPairs(block: string) {
  const pairs: string[] = []
  const regex = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30}?)\s+([A-Z]{3})\b/g
  let m: RegExpExecArray | null

  while ((m = regex.exec(block)) !== null) {
    const code = m[2].toUpperCase()
    if (!KNOWN_IATA.has(code)) continue
    if (pairs.length === 0 || pairs[pairs.length - 1] !== code) {
      pairs.push(code)
    }
  }

  return pairs
}

function parseRouteFromText(text: string) {
  const match = text.match(
    /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)\s+a\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)(?=\s|$|\n|Vuelo|JA|JZ|\d)/i
  )
  if (!match) return null

  const origin = formatCityLabel(match[1].trim())
  const destination = formatCityLabel(match[2].trim())
  if (origin === 'Sin ciudad' || destination === 'Sin ciudad' || origin === destination) return null

  return { origin, destination }
}

function parseJetSmartPassengers(text: string) {
  const passengers: { fullName: string }[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    const m = line.match(/^pasajer[oa]s?\s*:?\s*(.+)$/i)
    if (!m) continue
    const name = m[1].replace(/\s+/g, ' ').trim()
    if (name.length >= 4 && !/nombre|apellido|documento/i.test(name)) {
      passengers.push({ fullName: name })
    }
  }

  if (passengers.length > 0) return passengers

  for (const line of lines) {
    const titled = line.match(/^(?:MS|MR|MRS|SR|MISS|MSTR)\s+(.+)$/i)
    if (!titled) continue
    const name = titled[1].replace(/\s+/g, ' ').trim()
    if (name.length >= 4 && !/pasajero|ticket|emision/i.test(name)) {
      passengers.push({ fullName: name })
    }
  }

  if (passengers.length > 0) return passengers

  for (let i = 0; i < lines.length; i++) {
    if (!/^adulto$/i.test(normalizeText(lines[i]))) continue
    const name = lines[i - 1]
    if (!name || /nombre|pasajero|tipo|documento|reserva|localizador/i.test(name)) continue
    if (name.length < 4 || /\d{5,}/.test(name)) continue
    if (/^[A-Z0-9]{6}$/i.test(name)) continue
    passengers.push({ fullName: name.replace(/\s+/g, ' ').trim() })
  }

  return passengers
}

function parseJetSmartBookingCode(text: string) {
  const n = normalizeText(text)
  const inline =
    n.match(/confirmacion\s+reserva\s+([a-z0-9]{6})/i) ||
    n.match(/localizador\s*:?\s*([a-z0-9]{6})/i) ||
    n.match(/codigo de reserva\s*:?\s*([a-z0-9]{6})/i) ||
    n.match(/tu reserva\s*:?\s*([a-z0-9]{6})/i) ||
    n.match(/reserva\s+([a-z0-9]{6})\b/i)
  if (inline) return inline[1].toUpperCase()

  const lines = text.split('\n').map(l => l.trim())
  const headers =
    /localizador|codigo de reserva|tu reserva|administra tu viaje|^reserva$/i

  for (let i = 0; i < lines.length; i++) {
    if (!headers.test(normalizeText(lines[i]))) continue
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const code = lines[j]
      if (/^[A-Z0-9]{6}$/i.test(code)) return code.toUpperCase()
    }
  }

  return ''
}

function appendArrivalNextDay(flight: FlightSegment) {
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
}

function parseFlightBlock(
  block: string,
  flightNumber: string,
  bookingCode: string,
  previousDestination?: string
): FlightSegment | null {
  const normalized = normalizeOcrTimes(block)
  let cities = extractCitiesInBlock(normalized)
  cities = orderCitiesForConnection(cities, previousDestination)

  let origin = ''
  let destination = ''

  if (cities.length >= 2) {
    origin = formatCityLabel(cities[0])
    destination = formatCityLabel(cities[1])
  } else {
    const iata = extractKnownIataCodes(normalized)
    if (iata.length >= 2) {
      origin = cityFromIata(iata[0])
      destination = cityFromIata(iata[1])
    } else {
      const route = parseRouteFromText(normalized)
      if (!route) return null
      origin = route.origin
      destination = route.destination
    }
  }

  const times = extractTimes(normalized)
  const dates = extractDates(block)

  const flight: FlightSegment = {
    segment: 0,
    airline: 'Jetsmart',
    flightNumber,
    origin,
    destination,
    date: dates[0] || '',
    departureTime: times[0] || '',
    arrivalTime: times[1] || '',
    bookingCode,
  }

  appendArrivalNextDay(flight)
  return flight
}

/** Email/pantallazo "Confirmación Reserva" con bloques Fecha: + Cali CLO + JA####. */
function parseConfirmacionReserva(text: string, bookingCode: string) {
  const n = normalizeText(text)
  if (!n.includes('detalle reserva') && !n.includes('confirmacion reserva')) {
    return []
  }

  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const chunks = normalized.split(/(?=fecha\s*:?\s*\d{2}\/\d{2}\/\d{4})/gi)
  const flights: FlightSegment[] = []

  for (const chunk of chunks) {
    if (!/fecha\s*:?\s*\d{2}\/\d{2}\/\d{4}/i.test(chunk)) continue

    const date = extractSegmentDate(chunk)
    const flightMatches = jetSmartFlightsInText(chunk)
    if (flightMatches.length === 0) continue

    const { flightNumber } = flightMatches[0]
    const iataPairs = extractCityIataPairs(chunk)
    const iataFallback = extractKnownIataCodes(chunk)

    let origin = ''
    let destination = ''

    if (iataPairs.length >= 2) {
      origin = cityFromIata(iataPairs[0])
      destination = cityFromIata(iataPairs[1])
    } else if (iataFallback.length >= 2) {
      origin = cityFromIata(iataFallback[0])
      destination = cityFromIata(iataFallback[1])
    } else {
      let cities = extractCitiesInBlock(chunk)
      if (cities.length >= 2) {
        origin = formatCityLabel(cities[0])
        destination = formatCityLabel(cities[1])
      }
    }

    if (!origin || !destination) continue

    const times = extractTimes(chunk)

    const flight: FlightSegment = {
      segment: flights.length + 1,
      airline: 'Jetsmart',
      flightNumber,
      origin,
      destination,
      date,
      departureTime: times[0] || '',
      arrivalTime: times[1] || '',
      bookingCode,
    }

    appendArrivalNextDay(flight)
    flights.push(flight)
  }

  return flights
}

function parseFromFlightNumbers(text: string, bookingCode: string) {
  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const flightMatches = jetSmartFlightsInText(normalized)
  const flights: FlightSegment[] = []
  let previousDestination: string | undefined

  const startIdx = normalized.search(
    /detalle reserva|itinerario|tu vuelo|detalle del vuelo|vuelo\s+de ida/i
  )
  const docStart = startIdx >= 0 ? startIdx : 0

  for (let i = 0; i < flightMatches.length; i++) {
    const { flightNumber, index } = flightMatches[i]
    const headerStart =
      i === 0 ? docStart : flightMatches[i - 1].index + flightMatches[i - 1].flightNumber.length
    const header = normalized.slice(headerStart, index)
    const tailEnd =
      i + 1 < flightMatches.length ? flightMatches[i + 1].index : normalized.length
    const tail = normalized.slice(index + flightNumber.length, tailEnd)
    const block = `${header}\n${tail}`

    const flight = parseFlightBlock(block, flightNumber, bookingCode, previousDestination)
    if (flight) {
      flight.segment = flights.length + 1
      flights.push(flight)
      previousDestination = flight.destination
    }
  }

  return flights
}

function parseFromIataPath(text: string, bookingCode: string) {
  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const iataCodes = extractKnownIataCodes(normalized)
  if (iataCodes.length < 2) return []

  const times = extractTimes(normalized)
  const dates = extractDates(normalized)
  const flightMatches = jetSmartFlightsInText(normalized)
  const flights: FlightSegment[] = []
  const legs = iataCodes.length - 1

  for (let leg = 0; leg < legs; leg++) {
    let departureTime = ''
    let arrivalTime = ''

    if (times.length >= legs * 2) {
      departureTime = times[leg * 2] || ''
      arrivalTime = times[leg * 2 + 1] || ''
    } else if (times.length >= 2) {
      departureTime = times[0]
      arrivalTime = times[1]
    }

    const flight: FlightSegment = {
      segment: leg + 1,
      airline: 'Jetsmart',
      flightNumber: flightMatches[leg]?.flightNumber || flightMatches[0]?.flightNumber || '',
      origin: cityFromIata(iataCodes[leg]),
      destination: cityFromIata(iataCodes[leg + 1]),
      date: dates[0] || '',
      departureTime,
      arrivalTime,
      bookingCode,
    }

    appendArrivalNextDay(flight)
    flights.push(flight)
  }

  return flights
}

function parseSingleRouteCard(text: string, bookingCode: string) {
  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const route = parseRouteFromText(normalized)
  if (!route) return []

  const times = extractTimes(normalized)
  const dates = extractDates(normalized)
  const flightMatches = jetSmartFlightsInText(normalized)

  const flight: FlightSegment = {
    segment: 1,
    airline: 'Jetsmart',
    flightNumber: flightMatches[0]?.flightNumber || '',
    origin: route.origin,
    destination: route.destination,
    date: dates[0] || '',
    departureTime: times[0] || '',
    arrivalTime: times[1] || times[0] || '',
    bookingCode,
  }

  appendArrivalNextDay(flight)
  return [flight]
}

export function parseJetSmartItinerary(text: string) {
  const bookingCode = parseJetSmartBookingCode(text)
  const passengers = parseJetSmartPassengers(text)

  let flights = parseConfirmacionReserva(text, bookingCode)
  if (flights.length === 0) flights = parseFromFlightNumbers(text, bookingCode)
  if (flights.length === 0) flights = parseFromIataPath(text, bookingCode)
  if (flights.length === 0) flights = parseSingleRouteCard(text, bookingCode)

  const bookingCodes = bookingCode
    ? [{ airline: 'Jetsmart', code: bookingCode }]
    : []

  return {
    flights,
    passengers: passengers.length > 0 ? passengers : [{ fullName: '' }],
    bookingCodes,
    hints: [] as string[],
  }
}

export function tryParseJetSmartItinerary(text: string) {
  if (!isJetSmartItineraryFormat(text)) return null
  const parsed = parseJetSmartItinerary(text)
  if (parsed.flights.length === 0) return null
  if (
    !detectAirlineFromText(text) &&
    !parsed.flights.some(f => isJetSmartFlightNumber(f.flightNumber))
  ) {
    return null
  }
  return parsed
}
