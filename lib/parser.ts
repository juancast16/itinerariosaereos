// src/lib/parser.ts

import { AIRLINE_BY_PREFIX, detectAirlineFromText } from '@/lib/airline-codes'
import { cityFromIata, formatCityLabel, KNOWN_IATA } from '@/lib/city-keys'
import { mergeFlightSegments } from '@/lib/merge-flights'
import { isGdsTableFormat, parseGdsItineraryTable } from '@/lib/parse-gds-table'
import { tryParseJetSmartItinerary } from '@/lib/parse-jetsmart-itinerary'
import { tryParseLatamItinerary } from '@/lib/parse-latam-itinerary'
import { tryParseWingoItinerary } from '@/lib/parse-wingo-itinerary'
import { Itinerary, FlightSegment } from '@/lib/types'

function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function cleanSpaces(str: string) {
  return str.replace(/\s+/g, ' ').trim()
}

function stripNoise(str: string) {
  return cleanSpaces(
    str
      .replace(/[|•·]/g, ' ')
      .replace(/[^\p{L}\p{N}\s:/\-→>]/gu, ' ')
  )
}

const INVALID_CITY_WORDS = new Set([
  'salida',
  'llegada',
  'origen',
  'destino',
  'escala',
  'vuelo',
  'fecha',
  'itinerario',
  'directo',
  'tramo',
  'primer tramo',
  'segundo tramo',
  'check',
  'disponible',
  'operado',
  'parada',
  'basic',
  'habilitara',
  'meses',
  'dias',
  'semana',
])

const UI_NOISE_LINE =
  /check[\s-]?in|no disponible|operado por|se habilitara|habilitara en|\bparada\b|\bbasic\b|meses y \d+ dia/i

function isInvalidCityToken(value: string) {
  const n = normalize(value)
  if (!n || INVALID_CITY_WORDS.has(n)) return true
  if (n.length < 3) return true
  if (/^(check|in|no|por|se|en|el|la|los|las|del|de|a)$/i.test(n)) return true
  return ['disponible', 'habilitara', 'operado', 'parada'].some(w => n.includes(w))
}

function cleanCity(value: string) {
  let city = cleanSpaces(value)
  city = city.replace(/^(de|desde)\s+/i, '')
  city = city.replace(/\s+(de|a)\s*$/i, '')
  city = cleanSpaces(city)
  if (!city) return city
  const canonical = formatCityLabel(city)
  return canonical === 'Sin ciudad' ? city : canonical
}

function parseRouteFromLine(rawLine: string) {
  const raw = stripNoise(rawLine)
  if (!raw || UI_NOISE_LINE.test(raw)) return null

  // "Cali a San Andrés" (pantallazo Avianca / apps de viaje)
  const cityToCity = raw.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,35}?)\s+a\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,35})$/i)
  if (cityToCity) {
    const origin = cleanCity(cityToCity[1])
    const destination = cleanCity(cityToCity[2])
    if (
      origin &&
      destination &&
      !isInvalidCityToken(origin) &&
      !isInvalidCityToken(destination) &&
      normalize(origin) !== normalize(destination)
    ) {
      return { origin, destination }
    }
  }

  // Solo separadores con espacios (evita "Check-in" → Check + in no disponible)
  const arrowMatch = raw.match(/^(.+?)\s*(?:->|→|\s-\s)\s*(.+)$/)
  if (arrowMatch) {
    const origin = cleanCity(arrowMatch[1])
    const destination = cleanCity(arrowMatch[2])

    if (
      origin &&
      destination &&
      !isInvalidCityToken(origin) &&
      !isInvalidCityToken(destination) &&
      normalize(origin) !== normalize(destination)
    ) {
      return { origin, destination }
    }
  }

  const deAMatch = raw.match(/\bde\s+(.+?)\s+a\s+(.+)$/i)
  if (deAMatch) {
    const origin = cleanCity(deAMatch[1])
    const destination = cleanCity(deAMatch[2])

    if (
      origin &&
      destination &&
      !isInvalidCityToken(origin) &&
      !isInvalidCityToken(destination) &&
      normalize(origin) !== normalize(destination)
    ) {
      return { origin, destination }
    }
  }

  return null
}

function to24h(time: string, ampm?: string) {
  const [hRaw, m] = time.split(':')
  let h = Number(hRaw)
  if (Number.isNaN(h)) return time

  const marker = (ampm || '').toUpperCase()
  if (marker === 'PM' && h < 12) h += 12
  if (marker === 'AM' && h === 12) h = 0

  return `${String(h).padStart(2, '0')}:${m}`
}

function normalizeDate(value: string) {
  const v = normalize(value)

  const m1 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m1) {
    const d = m1[1].padStart(2, '0')
    const m = m1[2].padStart(2, '0')
    const y = m1[3].length === 2 ? `20${m1[3]}` : m1[3]
    return `${d}/${m}/${y}`
  }

  const m2 = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m2) {
    const y = m2[1]
    const m = m2[2].padStart(2, '0')
    const d = m2[3].padStart(2, '0')
    return `${d}/${m}/${y}`
  }

  const months: Record<string, string> = {
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

  const m3 = v.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{2,4})$/)
  if (m3) {
    const d = m3[1].padStart(2, '0')
    const m = months[m3[2]]
    const y = m3[3].length === 2 ? `20${m3[3]}` : m3[3]
    if (m) return `${d}/${m}/${y}`
  }

  const m4 = v.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{2,4})$/)
  if (m4) {
    const d = m4[1].padStart(2, '0')
    const m = months[m4[2]]
    const y = m4[3].length === 2 ? `20${m4[3]}` : m4[3]
    if (m) return `${d}/${m}/${y}`
  }

  const m5 = v.match(
    /(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo),?\s*(\d{1,2})\s+([a-z]+)\s+(\d{2,4})/
  )
  if (m5) {
    const d = m5[1].padStart(2, '0')
    const m = months[m5[2]]
    const y = m5[3].length === 2 ? `20${m5[3]}` : m5[3]
    if (m) return `${d}/${m}/${y}`
  }

  return ''
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

function extractTimesFromText(text: string) {
  const times: string[] = []
  const regex = /\b(\d{1,2}):(\d{2})\b/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const value = to24h(m[1] + ':' + m[2])
    if (!times.includes(value)) times.push(value)
  }
  return times
}

function parseRouteFromText(text: string) {
  const match = text.match(
    /\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)\s+a\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,30}?)(?=\s|$|\n|Miércoles|Miercoles|Operado|\d)/i
  )
  if (!match) return null

  const origin = cleanCity(match[1])
  const destination = cleanCity(match[2])
  if (
    !origin ||
    !destination ||
    isInvalidCityToken(origin) ||
    isInvalidCityToken(destination) ||
    normalize(origin) === normalize(destination)
  ) {
    return null
  }

  return { origin, destination }
}

function flightsLookLikeNoise(flights: FlightSegment[]) {
  return flights.some(f => isInvalidCityToken(f.origin) || isInvalidCityToken(f.destination))
}

function countParadas(text: string) {
  const m = text.match(/(\d+)\s*parada/i)
  return m ? Number(m[1]) : 0
}

function appendArrivalNextDayData(flight: FlightSegment) {
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

function buildLegsFromIataPath(
  iataCodes: string[],
  times: string[],
  meta: { date: string; airline: string; bookingCode: string }
): FlightSegment[] {
  const legs = iataCodes.length - 1
  if (legs < 1) return []

  const flights: FlightSegment[] = []

  for (let leg = 0; leg < legs; leg++) {
    let departureTime = ''
    let arrivalTime = ''

    if (times.length >= legs * 2) {
      departureTime = times[leg * 2] || ''
      arrivalTime = times[leg * 2 + 1] || ''
    } else if (times.length >= leg + 2) {
      departureTime = times[leg] || ''
      arrivalTime = times[leg + 1] || ''
    } else if (leg === 0 && times.length >= 2) {
      departureTime = times[0]
      arrivalTime = times[1]
    } else if (leg === legs - 1 && times.length >= 2) {
      departureTime = times[times.length - 2] || ''
      arrivalTime = times[times.length - 1] || ''
    }

    const flight: FlightSegment = {
      segment: leg + 1,
      airline: meta.airline || 'Aerolinea',
      flightNumber: '',
      origin: cityFromIata(iataCodes[leg]),
      destination: cityFromIata(iataCodes[leg + 1]),
      date: meta.date,
      departureTime,
      arrivalTime,
      bookingCode: meta.bookingCode,
    }

    appendArrivalNextDayData(flight)
    flights.push(flight)
  }

  return flights
}

type CardParseResult = { flights: FlightSegment[]; hints: string[] }

/** Pantallazos tipo tarjeta Avianca: "Cali a San Andrés", CLO, ADZ, 06:15, 11:10 */
function parseScreenshotCard(
  text: string,
  bookingCodes: { airline: string; code: string }[]
): CardParseResult {
  const hints: string[] = []
  const route = parseRouteFromText(text)
  const iataCodes = extractKnownIataCodes(text)
  const times = extractTimesFromText(text)

  let origin = route?.origin || ''
  let destination = route?.destination || ''

  if (!origin && iataCodes.length >= 2) {
    origin = cityFromIata(iataCodes[0])
    destination = cityFromIata(iataCodes[iataCodes.length - 1])
  }

  if (!origin || !destination || isInvalidCityToken(origin) || isInvalidCityToken(destination)) {
    return { flights: [], hints }
  }

  let date = ''
  for (const line of text.split('\n')) {
    const d = normalizeDate(stripNoise(line))
    if (d) {
      date = d
      break
    }
  }
  if (!date) {
    const inline = text.match(
      /(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i
    )
    if (inline) date = normalizeDate(stripNoise(inline[0]))
  }

  let airline = detectAirlineFromText(text)

  const meta = {
    date,
    airline: airline || 'Aerolinea',
    bookingCode: bookingCodes[0]?.code || '',
  }

  const paradas = countParadas(text)

  // Vista expandida: CLO → BOG → ADZ con varias horas
  if (iataCodes.length >= 3) {
    const legs = buildLegsFromIataPath(iataCodes, times, meta)
    if (legs.length > 0) return { flights: legs, hints }
  }

  if (paradas > 0 && iataCodes.length === 2) {
    hints.push(
      `Se detectó ${paradas} escala(s) en la captura, pero solo aparecen ${iataCodes[0]} y ${iataCodes[1]}. ` +
        'Abre el detalle del vuelo en la app (donde se ve cada tramo) y pega otra captura para agregar los segmentos.'
    )
  }

  const flight: FlightSegment = {
    segment: 1,
    airline: meta.airline,
    flightNumber: '',
    origin,
    destination,
    date: meta.date,
    departureTime: times[0] || '',
    arrivalTime: times[times.length - 1] || times[0] || '',
    bookingCode: meta.bookingCode,
  }

  appendArrivalNextDayData(flight)
  return { flights: [flight], hints }
}

function detectAirlineByCode(code: string) {
  return AIRLINE_BY_PREFIX[code.toUpperCase()] || ''
}

function parsePassengerLines(lines: string[]) {
  const passengers: { fullName: string }[] = []

  for (const line of lines) {
    const clean = stripNoise(line)
    const m = clean.match(/^pasajero\s*\d+\s+(.+)$/i)
    if (m) {
      const fullName = cleanSpaces(m[1])
      if (fullName.length > 2) {
        passengers.push({ fullName })
      }
    }
  }

  if (passengers.length > 0) return passengers

  for (const line of lines) {
    if (/\(nombre\)|\(apellidos\)/i.test(line)) {
      const fullName = cleanSpaces(
        line
          .replace(/^\d+\s*/, '')
          .replace(/\(Nombre\)|\(Apellidos\)/gi, '')
      )
      if (fullName) return [{ fullName }]
    }
  }

  return [{ fullName: '' }]
}

function parseBookingCodes(text: string) {
  const bookingCodes: { airline: string; code: string }[] = []
  const upper = text.toUpperCase()

  const regex =
    /(PNR|LOCALIZADOR|CODIGO DE RESERVA|CÓDIGO DE RESERVA)[^\n]{0,40}?\b([A-Z0-9]{5,6})\b/g

  let m: RegExpExecArray | null
  while ((m = regex.exec(upper)) !== null) {
    const code = m[2]
    if (
      /^[A-Z0-9]{5,6}$/.test(code) &&
      !/DIRECTO|BASICO|TURISTA|RESERV|CHECK|NUMERO/.test(code)
    ) {
      if (!bookingCodes.some(b => b.code === code)) {
        bookingCodes.push({ airline: 'Desconocida', code })
      }
    }
  }

  return bookingCodes
}

function parseFlights(lines: string[], bookingCodes: { airline: string; code: string }[]) {
  const flights: FlightSegment[] = []
  let segmentCounter = 1

  type TimeCandidate = { value: string; isScale: boolean }
  const INVALID_IATA_TOKENS = new Set(['AM', 'PM', 'PNR', 'RNT', 'NIT', 'IVA', 'TOT', 'USD'])

  function appendArrivalNextDayData(flight: FlightSegment) {
    if (flight.departureTime && flight.arrivalTime && flight.arrivalTime < flight.departureTime && flight.date) {
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

  for (let i = 0; i < lines.length; i++) {
    const route = parseRouteFromLine(lines[i])
    if (!route) continue

    const origin = route.origin
    const destination = route.destination

    let airline = ''
    let flightNumber = ''
    let date = ''
    let departureTime = ''
    let arrivalTime = ''
    let bookingCode = ''

    const departureCandidates: TimeCandidate[] = []
    const arrivalCandidates: TimeCandidate[] = []
    const neutralTimes: TimeCandidate[] = []
    const allTimesInOrder: string[] = []
    const standaloneIataCodes: string[] = []

    for (let j = i; j < i + 22 && j < lines.length; j++) {
      const rawLine = lines[j].trim()
      const line = stripNoise(lines[j])
      if (!line) continue
      const nline = normalize(line)

      if (/^[A-Z]{3}$/.test(rawLine) && !INVALID_IATA_TOKENS.has(rawLine)) {
        standaloneIataCodes.push(rawLine)
      }

      const flightMatch = line.match(/\b([A-Z]{2})(\d{2,5})\b/)
      if (flightMatch && !flightNumber) {
        flightNumber = `${flightMatch[1]}${flightMatch[2]}`
        airline = detectAirlineByCode(flightMatch[1])
      }

      if (!flightNumber) {
        const genericFlight = line.match(/\bvuelo\s+([A-Z]{1,3}\d{2,5}|\d{2,5})\b/i)
        if (genericFlight) {
          const code = genericFlight[1].toUpperCase()
          flightNumber = code
          const prefix = code.match(/^[A-Z]{2}/)?.[0] || ''
          airline = detectAirlineByCode(prefix)
        }
      }

      const dateCandidate = normalizeDate(line)
      if (dateCandidate && !date) {
        date = dateCandidate
      }

      const pnrMatch = line.match(/\b[A-Z0-9]{5,6}\b/)
      if (pnrMatch && /PNR|LOCALIZADOR|RESERVA/i.test(line) && !bookingCode) {
        bookingCode = pnrMatch[0]
      }

      const timeRegex = /(\d{1,2}:\d{2})\s*(AM|PM)?/gi
      let tm: RegExpExecArray | null
      while ((tm = timeRegex.exec(line)) !== null) {
        const value = to24h(tm[1], (tm[2] || '').toUpperCase())
        allTimesInOrder.push(value)
        const isScale = /escala|conexion|conexion|conexi[oó]n/.test(nline)

        if (/salida|origen/.test(nline)) {
          departureCandidates.push({ value, isScale })
        } else if (/llegada|destino/.test(nline)) {
          arrivalCandidates.push({ value, isScale })
        } else {
          neutralTimes.push({ value, isScale })
        }
      }
    }

    const iataPath = standaloneIataCodes.filter(
      (code, idx) => idx === 0 || code !== standaloneIataCodes[idx - 1]
    )
    const legs = iataPath.length - 1

    if (iataPath.length >= 3 && allTimesInOrder.length >= legs * 2) {
      for (let leg = 0; leg < legs; leg++) {
        const legFlight: FlightSegment = {
          segment: segmentCounter++,
          airline: airline || 'Aerolinea',
          flightNumber: flightNumber || '',
          origin: iataPath[leg],
          destination: iataPath[leg + 1],
          date,
          departureTime: allTimesInOrder[leg * 2] || '',
          arrivalTime: allTimesInOrder[leg * 2 + 1] || '',
          bookingCode: bookingCode || bookingCodes[0]?.code || '',
        }

        appendArrivalNextDayData(legFlight)

        const duplicatedLeg = flights.some(
          f =>
            normalize(f.origin) === normalize(legFlight.origin) &&
            normalize(f.destination) === normalize(legFlight.destination) &&
            f.flightNumber === legFlight.flightNumber
        )

        if (!duplicatedLeg) {
          flights.push(legFlight)
        }
      }

      continue
    }

    if (departureCandidates.length > 0) {
      departureTime = departureCandidates[0].value
    } else if (neutralTimes.length > 0) {
      departureTime = neutralTimes[0].value
    }

    const nonScaleArrivals = arrivalCandidates.filter(c => !c.isScale)
    if (nonScaleArrivals.length > 0) {
      arrivalTime = nonScaleArrivals[nonScaleArrivals.length - 1].value
    } else if (arrivalCandidates.length > 0) {
      arrivalTime = arrivalCandidates[arrivalCandidates.length - 1].value
    } else if (neutralTimes.length > 1) {
      arrivalTime = neutralTimes[neutralTimes.length - 1].value
    }

    if (!airline && flights.length > 0) {
      airline = flights[flights.length - 1].airline
    }

    const flight: FlightSegment = {
      segment: segmentCounter++,
      airline: airline || 'Aerolinea',
      flightNumber: flightNumber || '',
      origin,
      destination,
      date,
      departureTime,
      arrivalTime,
      bookingCode: bookingCode || bookingCodes[0]?.code || '',
    }

    appendArrivalNextDayData(flight)

    const duplicated = flights.some(
      f =>
        normalize(f.origin) === normalize(flight.origin) &&
        normalize(f.destination) === normalize(flight.destination) &&
        f.flightNumber === flight.flightNumber
    )

    if (!duplicated) {
      flights.push(flight)
    }
  }

  return flights
}

function parseOneOcrText(text: string): {
  flights: FlightSegment[]
  hints: string[]
  passengers: { fullName: string }[]
  bookingCodes: { airline: string; code: string }[]
} {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const latamParsed = tryParseLatamItinerary(text)
  if (latamParsed) {
    return {
      flights: latamParsed.flights,
      hints: latamParsed.hints,
      passengers: latamParsed.passengers,
      bookingCodes: latamParsed.bookingCodes,
    }
  }

  const jetSmartParsed = tryParseJetSmartItinerary(text)
  if (jetSmartParsed) {
    return {
      flights: jetSmartParsed.flights,
      hints: jetSmartParsed.hints,
      passengers: jetSmartParsed.passengers,
      bookingCodes: jetSmartParsed.bookingCodes,
    }
  }

  const wingoParsed = tryParseWingoItinerary(text)
  if (wingoParsed) {
    return {
      flights: wingoParsed.flights,
      hints: wingoParsed.hints,
      passengers: wingoParsed.passengers,
      bookingCodes: wingoParsed.bookingCodes,
    }
  }

  const passengers = parsePassengerLines(lines)
  const bookingCodes = parseBookingCodes(text)
  const pnr = bookingCodes[0]?.code || ''

  if (isGdsTableFormat(text)) {
    const gdsFlights = parseGdsItineraryTable(text, pnr)
    if (gdsFlights.length > 0) {
      return { flights: gdsFlights, hints: [], passengers, bookingCodes }
    }
  }

  const lineFlights = parseFlights(lines, bookingCodes)
  const card = parseScreenshotCard(text, bookingCodes)
  const flights =
    card.flights.length > 0 && (lineFlights.length === 0 || flightsLookLikeNoise(lineFlights))
      ? card.flights
      : lineFlights

  return { flights, hints: card.hints, passengers, bookingCodes }
}

export function parseItinerary(texts: string[]): Itinerary {
  const sources = texts.map(t => t.trim()).filter(Boolean)
  const combinedText = sources.join('\n')

  let flights: FlightSegment[] = []
  const hints: string[] = []
  let passengers: { fullName: string }[] = [{ fullName: '' }]
  const bookingCodes: { airline: string; code: string }[] = []

  for (const text of sources.length > 0 ? sources : ['']) {
    const parsed = parseOneOcrText(text)
    flights = mergeFlightSegments(flights, parsed.flights).segments
    hints.push(...parsed.hints)

    if (parsed.passengers.some(p => p.fullName.trim())) {
      passengers = parsed.passengers
    }

    for (const code of parsed.bookingCodes) {
      if (!bookingCodes.some(b => b.code === code.code)) {
        bookingCodes.push(code)
      }
    }
  }

  if (bookingCodes.length > 0 && flights.length > 0 && bookingCodes[0].airline === 'Desconocida') {
    bookingCodes[0].airline = flights[0].airline || 'Desconocida'
  }

  return {
    passengers,
    bookingCodes,
    flights,
    hints: [...new Set(hints)],
    baggage: {
      personalItem: true,
      cabin10kg: false,
      checked23kg: false,
    },
  }
}