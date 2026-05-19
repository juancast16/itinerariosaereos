import {
  detectAirlineFromText,
  findKnownFlightNumbers,
  isWingoFlightNumber,
  normalizeFlightNumberSpacing,
} from '@/lib/airline-codes'
import { cityFromIata, formatCityLabel, KNOWN_IATA } from '@/lib/city-keys'
import { FlightSegment } from '@/lib/types'

const WINGO_CITY_PATTERNS: { re: RegExp; city: string }[] = [
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
  { re: /\bpanama/gi, city: 'PANAMA' },
  { re: /\bmiami/gi, city: 'MIAMI' },
  { re: /\bmexico/gi, city: 'MEXICO' },
  { re: /\bcancun/gi, city: 'CANCUN' },
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
    .replace(/\b(\d{1,2}:\d{2})\s+([ap])\s+m\b/gi, '$1 $2m')
}

function wingoFlightsInText(text: string) {
  return findKnownFlightNumbers(normalizeFlightNumberSpacing(text)).filter(f =>
    isWingoFlightNumber(f.flightNumber)
  )
}

function isWingoBrand(text: string) {
  const n = normalizeText(text)
  return (
    n.includes('wingo') ||
    n.includes('aero republica') ||
    /\bwi\s+adulto\b/.test(n) ||
    /\bviajeros\b/.test(n)
  )
}

export function isWingoItineraryFormat(text: string) {
  const n = normalizeText(text)
  const p5Flights = wingoFlightsInText(text)
  const hasBrand = isWingoBrand(text)
  const hasBookingHint =
    n.includes('mi reserva') ||
    n.includes('codigo de reserva') ||
    n.includes('localizador') ||
    n.includes('resumen de viaje') ||
    n.includes('tu viaje') ||
    n.includes('confirmacion') ||
    n.includes('detalle reserva') ||
    n.includes('check in') ||
    n.includes('check-in')

  const hasIdaRegreso =
    n.includes('vuelo de ida') && n.includes('vuelo de regreso')

  if (p5Flights.length > 0 && (hasBrand || hasBookingHint)) return true
  if (hasBookingHint && hasIdaRegreso) return true
  if (hasBrand && hasIdaRegreso) return true
  if (hasBrand && extractKnownIataCodes(text).length >= 2) return true
  if (hasBrand && /\b([a-z]{3,25})\s+a\s+([a-z]{3,25})\b/i.test(text)) return true
  if (hasBrand && /\b[A-Z]{3}\s*[-–→]\s*[A-Z]{3}\b/.test(text)) return true

  return false
}

function parseWingoDate(value: string) {
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

  const weekday = v.match(
    /(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/
  )
  if (weekday) {
    const month = MONTHS[weekday[2]]
    if (month) {
      return `${weekday[1].padStart(2, '0')}/${month}/${weekday[3]}`
    }
  }

  return ''
}

function parseWingoTime12(raw: string) {
  const m = raw.match(/(\d{1,2})[:\.](\d{2})/i)
  if (!m) return ''

  let hour = Number(m[1])
  const minute = m[2]
  const marker = raw.toLowerCase()

  if ((/p\.?\s*m/.test(marker) || /\bp\s+m\b/.test(marker)) && hour < 12) hour += 12
  if ((/a\.?\s*m/.test(marker) || /\ba\s+m\b/.test(marker)) && hour === 12) hour = 0

  return `${String(hour).padStart(2, '0')}:${minute}`
}

function pairTimesForRoundTrip(times: string[]) {
  if (times.length < 4) {
    return [
      { departureTime: times[0] || '', arrivalTime: times[1] || '' },
      { departureTime: times[2] || '', arrivalTime: times[3] || '' },
    ]
  }

  const evening = times
    .filter(t => Number(t.split(':')[0]) >= 17)
    .sort()
  const morning = times
    .filter(t => Number(t.split(':')[0]) < 12)
    .sort()

  if (evening.length >= 2 && morning.length >= 2) {
    return [
      { departureTime: evening[0], arrivalTime: evening[1] },
      { departureTime: morning[0], arrivalTime: morning[1] },
    ]
  }

  return [
    { departureTime: times[0] || '', arrivalTime: times[1] || '' },
    { departureTime: times[2] || '', arrivalTime: times[3] || '' },
  ]
}

function extractWeekdayDates(text: string) {
  const dates: string[] = []
  const regex =
    /(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/gi
  let m: RegExpExecArray | null

  while ((m = regex.exec(stripAccents(text))) !== null) {
    const d = parseWingoDate(`${m[1]} ${m[2]} ${m[3]}`)
    if (d && !dates.includes(d)) dates.push(d)
  }

  return dates
}

function extractAllTimesInOrder(text: string) {
  const normalized = normalizeOcrTimes(text)
  const times: string[] = []
  const regex = /(\d{1,2})[:\.](\d{2})(?:\s*([ap])\s*\.?\s*m\.?)?/gi
  let m: RegExpExecArray | null

  while ((m = regex.exec(normalized)) !== null) {
    const hour = Number(m[1])
    if (hour > 23) continue
    const raw = m[0]
    if (/^0[:\.]/.test(raw)) continue
    const value = parseWingoTime12(raw)
    if (value && !times.includes(value)) times.push(value)
  }

  return times
}

function extractAllIataInOrder(text: string) {
  const found: string[] = []
  const regex = /\b([A-Z]{3})\b/g
  let m: RegExpExecArray | null

  while ((m = regex.exec(text.toUpperCase())) !== null) {
    const code = m[1]
    if (KNOWN_IATA.has(code)) found.push(code)
  }

  return found
}

function inferRoundTripLegs(iatas: string[]) {
  if (iatas.length >= 4 && iatas[0] === iatas[3] && iatas[1] === iatas[2]) {
    return [
      [iatas[0], iatas[1]],
      [iatas[2], iatas[3]],
    ] as const
  }

  const deduped: string[] = []
  for (const code of iatas) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== code) {
      deduped.push(code)
    }
  }

  if (deduped.length === 3 && deduped[0] === deduped[2]) {
    return [
      [deduped[0], deduped[1]],
      [deduped[1], deduped[2]],
    ] as const
  }

  if (deduped.length >= 2) {
    return [[deduped[0], deduped[1]]] as const
  }

  return [] as const
}

function extractCitiesInBlock(block: string) {
  const searchBlock = stripAccents(block)
  const found: { index: number; city: string }[] = []

  for (const { re, city } of WINGO_CITY_PATTERNS) {
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
    const dep = parseWingoTime12(salida[1])
    if (dep) times.push(dep)
  }
  if (llegada) {
    const arr = parseWingoTime12(llegada[1])
    if (arr && !times.includes(arr)) times.push(arr)
  }
  if (times.length >= 2) return times

  const range = normalized.match(
    /(\d{1,2}[:\.]\d{2})\s*[-–]\s*(\d{1,2}[:\.]\d{2})/i
  )
  if (range) {
    const dep = parseWingoTime12(range[1])
    const arr = parseWingoTime12(range[2])
    if (dep) times.push(dep)
    if (arr && !times.includes(arr)) times.push(arr)
    if (times.length >= 2) return times
  }

  const regex = /\b(\d{1,2}[:\.]\d{2})(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))?\b/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(normalized)) !== null) {
    const raw = m[1]
    if (/^0[:\.]/.test(raw)) continue
    const value = parseWingoTime12(raw)
    if (value && !times.includes(value)) times.push(value)
  }

  return times
}

function extractSegmentDate(block: string) {
  const fecha = block.match(/fecha\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i)
  if (fecha) return parseWingoDate(fecha[1])
  return ''
}

function extractDates(block: string) {
  const segmentDate = extractSegmentDate(block)
  if (segmentDate) return [segmentDate]

  const dates: string[] = []
  const slash = /\b(\d{2}\/\d{2}\/\d{2,4})\b/g
  let m: RegExpExecArray | null
  while ((m = slash.exec(block)) !== null) {
    const d = parseWingoDate(m[1])
    if (d && !dates.includes(d)) dates.push(d)
  }

  const words = /\b(\d{1,2}\s+[a-z]{3,12}\s+\d{2,4})\b/gi
  while ((m = words.exec(block)) !== null) {
    const d = parseWingoDate(m[1])
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

function parseRouteDashIata(block: string) {
  const m = block.match(/\b([A-Z]{3})\s*[-–→]\s*([A-Z]{3})\b/)
  if (!m) return null
  if (!KNOWN_IATA.has(m[1]) || !KNOWN_IATA.has(m[2])) return null
  return { origin: cityFromIata(m[1]), destination: cityFromIata(m[2]) }
}

function parseRouteFromText(text: string) {
  const match = text.match(
    /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)\s+a\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)(?=\s|$|\n|Vuelo|P5|\d)/i
  )
  if (!match) return null

  const origin = formatCityLabel(match[1].trim())
  const destination = formatCityLabel(match[2].trim())
  if (origin === 'Sin ciudad' || destination === 'Sin ciudad' || origin === destination) return null

  return { origin, destination }
}

function parseWingoPassengers(text: string) {
  const passengers: { fullName: string }[] = []
  const viajeros = text.match(/viajeros\s+(.+?)\s+wi\s+adulto/i)
  if (viajeros) {
    const name = viajeros[1].replace(/\s+/g, ' ').trim()
    if (name.length >= 4) passengers.push({ fullName: name })
  }

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
    if (name.length >= 4 && !/pasajero|ticket|emision|reserva/i.test(name)) {
      passengers.push({ fullName: name })
    }
  }

  return passengers
}

function parseWingoBookingCode(text: string) {
  const n = normalizeText(text)
  const inline =
    n.match(/confirmacion\s+reserva\s+([a-z0-9]{5,7})/i) ||
    n.match(/codigo de reserva\s*:?\s*([a-z0-9]{5,7})/i) ||
    n.match(/localizador\s*:?\s*([a-z0-9]{5,7})/i) ||
    n.match(/mi reserva\s*:?\s*([a-z0-9]{5,7})/i) ||
    n.match(/reserva\s+([a-z0-9]{5,7})\b/i)
  if (inline) return inline[1].toUpperCase()

  const lines = text.split('\n').map(l => l.trim())
  const headers =
    /localizador|codigo de reserva|mi reserva|resumen de viaje|tu viaje|^reserva$/i

  for (let i = 0; i < lines.length; i++) {
    if (!headers.test(normalizeText(lines[i]))) continue
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const code = lines[j]
      if (/^[A-Z0-9]{5,7}$/i.test(code)) return code.toUpperCase()
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

function resolveOriginDestination(
  block: string,
  previousDestination?: string
): { origin: string; destination: string } | null {
  const normalized = normalizeOcrTimes(block)

  const dashRoute = parseRouteDashIata(normalized)
  if (dashRoute) return dashRoute

  let cities = extractCitiesInBlock(normalized)
  cities = orderCitiesForConnection(cities, previousDestination)

  if (cities.length >= 2) {
    return {
      origin: formatCityLabel(cities[0]),
      destination: formatCityLabel(cities[1]),
    }
  }

  const iataPairs = extractCityIataPairs(normalized)
  if (iataPairs.length >= 2) {
    return {
      origin: cityFromIata(iataPairs[0]),
      destination: cityFromIata(iataPairs[1]),
    }
  }

  const iataFallback = extractKnownIataCodes(normalized)
  if (iataFallback.length >= 2) {
    return {
      origin: cityFromIata(iataFallback[0]),
      destination: cityFromIata(iataFallback[1]),
    }
  }

  const route = parseRouteFromText(normalized)
  if (route) return route

  return null
}

/** Pantallazo confirmación: Viajeros + Código reserva + Vuelo ida/regreso en columnas. */
function parseConfirmacionViajeros(text: string, bookingCode: string) {
  const n = normalizeText(text)
  if (!n.includes('codigo de reserva') || !n.includes('vuelo de ida')) {
    return []
  }

  const iatas = extractAllIataInOrder(text)
  const legs = inferRoundTripLegs(iatas)
  if (legs.length === 0) return []

  const dates = extractWeekdayDates(text)
  const times = extractAllTimesInOrder(text)
  const timePairs = pairTimesForRoundTrip(times)
  const flightMatches = wingoFlightsInText(text)
  const flights: FlightSegment[] = []

  for (let i = 0; i < legs.length; i++) {
    const [originCode, destCode] = legs[i]
    const flight: FlightSegment = {
      segment: i + 1,
      airline: 'Wingo',
      flightNumber: flightMatches[i]?.flightNumber || flightMatches[0]?.flightNumber || '',
      origin: cityFromIata(originCode),
      destination: cityFromIata(destCode),
      date: dates[i] || '',
      departureTime: timePairs[i]?.departureTime || '',
      arrivalTime: timePairs[i]?.arrivalTime || '',
      bookingCode,
    }
    appendArrivalNextDay(flight)
    flights.push(flight)
  }

  return flights
}

function parseFechaSegments(text: string, bookingCode: string) {
  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const chunks = normalized.split(/(?=fecha\s*:?\s*\d{2}\/\d{2}\/\d{4})/gi)
  const flights: FlightSegment[] = []

  for (const chunk of chunks) {
    if (!/fecha\s*:?\s*\d{2}\/\d{2}\/\d{4}/i.test(chunk)) continue

    const date = extractSegmentDate(chunk)
    const flightMatches = wingoFlightsInText(chunk)
    if (flightMatches.length === 0) continue

    const route = resolveOriginDestination(
      chunk,
      flights.length > 0 ? flights[flights.length - 1].destination : undefined
    )
    if (!route) continue

    const times = extractTimes(chunk)
    const flight: FlightSegment = {
      segment: flights.length + 1,
      airline: 'Wingo',
      flightNumber: flightMatches[0].flightNumber,
      origin: route.origin,
      destination: route.destination,
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

function parseResumenViaje(text: string, bookingCode: string) {
  const n = normalizeText(text)
  if (!n.includes('resumen de viaje') && !n.includes('vuelo de ida') && !n.includes('vuelo de regreso')) {
    return []
  }

  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const parts = normalized.split(/(?=vuelo de (?:ida|regreso|vuelta))/gi)
  const flights: FlightSegment[] = []

  for (const part of parts) {
    if (!/vuelo de (?:ida|regreso|vuelta)/i.test(part)) continue

    const flightMatches = wingoFlightsInText(part)
    const route = resolveOriginDestination(
      part,
      flights.length > 0 ? flights[flights.length - 1].destination : undefined
    )
    if (!route) continue

    const dates = extractDates(part)
    const times = extractTimes(part)

    const flight: FlightSegment = {
      segment: flights.length + 1,
      airline: 'Wingo',
      flightNumber: flightMatches[0]?.flightNumber || '',
      origin: route.origin,
      destination: route.destination,
      date: dates[0] || '',
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
  const flightMatches = wingoFlightsInText(normalized)
  const flights: FlightSegment[] = []

  const startIdx = normalized.search(
    /resumen de viaje|detalle reserva|mi reserva|itinerario|tu viaje|vuelo de ida/i
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

    const route = resolveOriginDestination(
      block,
      flights.length > 0 ? flights[flights.length - 1].destination : undefined
    )
    if (!route) continue

    const times = extractTimes(block)
    const dates = extractDates(block)

    const flight: FlightSegment = {
      segment: flights.length + 1,
      airline: 'Wingo',
      flightNumber,
      origin: route.origin,
      destination: route.destination,
      date: dates[0] || '',
      departureTime: times[0] || '',
      arrivalTime: times[1] || '',
      bookingCode,
    }

    appendArrivalNextDay(flight)
    flights.push(flight)
  }

  return flights
}

function parseFromIataPath(text: string, bookingCode: string) {
  const normalized = normalizeOcrTimes(normalizeFlightNumberSpacing(text))
  const iataCodes = extractKnownIataCodes(normalized)
  if (iataCodes.length < 2) return []

  const times = extractTimes(normalized)
  const dates = extractDates(normalized)
  const flightMatches = wingoFlightsInText(normalized)
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
      airline: 'Wingo',
      flightNumber: flightMatches[leg]?.flightNumber || flightMatches[0]?.flightNumber || '',
      origin: cityFromIata(iataCodes[leg]),
      destination: cityFromIata(iataCodes[leg + 1]),
      date: dates[leg] || dates[0] || '',
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
  const route =
    parseRouteDashIata(normalized) || parseRouteFromText(normalized) || resolveOriginDestination(normalized)
  if (!route) return []

  const times = extractTimes(normalized)
  const dates = extractDates(normalized)
  const flightMatches = wingoFlightsInText(normalized)

  const flight: FlightSegment = {
    segment: 1,
    airline: 'Wingo',
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

export function parseWingoItinerary(text: string) {
  const bookingCode = parseWingoBookingCode(text)
  const passengers = parseWingoPassengers(text)

  let flights = parseConfirmacionViajeros(text, bookingCode)
  if (flights.length === 0) flights = parseFechaSegments(text, bookingCode)
  if (flights.length === 0) flights = parseResumenViaje(text, bookingCode)
  if (flights.length === 0) flights = parseFromFlightNumbers(text, bookingCode)
  if (flights.length === 0) flights = parseFromIataPath(text, bookingCode)
  if (flights.length === 0) flights = parseSingleRouteCard(text, bookingCode)

  const bookingCodes = bookingCode ? [{ airline: 'Wingo', code: bookingCode }] : []

  return {
    flights,
    passengers: passengers.length > 0 ? passengers : [{ fullName: '' }],
    bookingCodes,
    hints: [] as string[],
  }
}

export function tryParseWingoItinerary(text: string) {
  if (!isWingoItineraryFormat(text)) return null
  const parsed = parseWingoItinerary(text)
  if (parsed.flights.length === 0) return null
  const hasP5 = parsed.flights.some(f => isWingoFlightNumber(f.flightNumber))
  if (!detectAirlineFromText(text) && !isWingoBrand(text) && !hasP5) {
    return null
  }
  return parsed
}
