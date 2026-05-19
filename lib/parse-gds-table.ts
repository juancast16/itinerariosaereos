import {
  airlineFromFlightNumber,
  AIRLINE_BY_PREFIX,
  detectAirlineFromText,
  findKnownFlightNumbers,
} from '@/lib/airline-codes'
import { formatCityLabel } from '@/lib/city-keys'
import { FlightSegment } from '@/lib/types'

const GDS_MONTHS: Record<string, string> = {
  jan: '01',
  ene: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
  dic: '12',
}

const CITY_MARKERS: { re: RegExp; city: string }[] = [
  { re: /SAN\s+ANDRES(?:\s+ISLAND)?(?:\s+GUSTAVO)?/gi, city: 'SAN ANDRES' },
  { re: /BOGOTA(?:\s+EL\s+DORADO)?(?:\s+INTL)?/gi, city: 'BOGOTA' },
  { re: /MEDELLIN(?:\s+JOSE\s+MARIA)?(?:\s+CORDOVA)?/gi, city: 'MEDELLIN' },
  { re: /\bCALI(?:\s+ALFONSO)?/gi, city: 'CALI' },
  { re: /CARTAGENA(?:\s+RAFAEL)?/gi, city: 'CARTAGENA' },
  { re: /BARRANQUILLA(?:\s+ERNESTO)?/gi, city: 'BARRANQUILLA' },
  { re: /SANTIAGO(?:\s+DE\s+CHILE)?(?:\s+INTL)?/gi, city: 'SANTIAGO' },
  { re: /LIMA(?:\s+JORGE\s+CHAVEZ)?/gi, city: 'LIMA' },
  { re: /BUENOS\s+AIRES(?:\s+EZEIZA)?/gi, city: 'BUENOS AIRES' },
  { re: /SANTA\s+MARTA(?:\s+SIMON)?/gi, city: 'SANTA MARTA' },
  { re: /PEREIRA(?:\s+MATECANA)?/gi, city: 'PEREIRA' },
  { re: /CUCUTA(?:\s+CAMILO)?/gi, city: 'CUCUTA' },
  { re: /MONTERIA(?:\s+LOS)?/gi, city: 'MONTERIA' },
]

function parseGdsDateToken(token: string) {
  const m = token.match(/(\d{1,2})\s*([A-Za-z]{3})\s*(\d{4})/)
  if (!m) return ''
  const mon = GDS_MONTHS[m[2].toLowerCase()]
  if (!mon) return ''
  return `${m[1].padStart(2, '0')}/${mon}/${m[3]}`
}

function extractCitiesInOrder(text: string) {
  const markers: { index: number; city: string }[] = []

  for (const { re, city } of CITY_MARKERS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      markers.push({ index: m.index, city })
    }
  }

  markers.sort((a, b) => a.index - b.index)

  const cities: string[] = []
  for (const { city } of markers) {
    if (cities.length === 0 || cities[cities.length - 1] !== city) {
      cities.push(city)
    }
  }

  return cities
}

function stripDurationLines(text: string) {
  return text
    .split('\n')
    .filter(line => !/duration/i.test(line))
    .join('\n')
}

function extractValidTimes(cleaned: string) {
  const times: string[] = []

  for (const line of cleaned.split('\n')) {
    if (/duration/i.test(line)) continue

    const timeRegex = /\b(\d{1,2}):(\d{2})\b/g
    let m: RegExpExecArray | null
    while ((m = timeRegex.exec(line)) !== null) {
      const time = `${m[1].padStart(2, '0')}:${m[2]}`
      if (!times.includes(time)) times.push(time)
    }
  }

  return times
}

/** Pares hora + fecha: "18:25 29Aug2026" o en líneas separadas. */
function extractTimeDatePairs(cleaned: string, flatText?: string) {
  const pairs: { time: string; date: string }[] = []
  const flat = flatText ?? cleaned.replace(/\s+/g, ' ')

  const pushPair = (h: string, min: string, dateRaw: string, atIndex: number) => {
    const date = parseGdsDateToken(dateRaw)
    if (!date) return
    const time = `${h.padStart(2, '0')}:${min}`
    const nearDuration = flat
      .slice(Math.max(0, atIndex - 30), atIndex + 30)
      .toLowerCase()
      .includes('duration')
    if (nearDuration) return
    if (!pairs.some(p => p.time === time && p.date === date)) {
      pairs.push({ time, date })
    }
  }

  const inlineRegex = /\b(\d{1,2}):(\d{2})\s+(\d{1,2}[A-Za-z]{3}\d{4})\b/gi
  let m: RegExpExecArray | null
  while ((m = inlineRegex.exec(flat)) !== null) {
    pushPair(m[1], m[2], m[3], m.index ?? 0)
  }

  const multilineRegex = /\b(\d{1,2}):(\d{2})\s*\n\s*(\d{1,2}[A-Za-z]{3}\d{4})\b/gi
  while ((m = multilineRegex.exec(cleaned)) !== null) {
    pushPair(m[1], m[2], m[3], m.index ?? 0)
  }

  return pairs
}

type LegSchedule = { departureTime: string; arrivalTime: string; date: string }

/** Quita "01:50" de Duration y horas sueltas que no son salida/llegada. */
function filterScheduleTimes(times: string[], context: string) {
  const withoutDuration = times.filter(t => {
    const idx = context.indexOf(t)
    if (idx < 0) return true
    const snippet = context.slice(Math.max(0, idx - 30), idx + t.length + 30).toLowerCase()
    return !snippet.includes('duration')
  })

  const main = withoutDuration.filter(t => {
    const hour = Number(t.split(':')[0])
    return hour >= 5 || hour === 0
  })

  if (main.length >= 2) return main
  return withoutDuration
}

function scheduleFromPairsAndTimes(pairs: { time: string; date: string }[], times: string[], flat: string): LegSchedule {
  const date = pairs[0]?.date || extractGdsDates(flat)[0] || ''

  if (pairs.length >= 2) {
    return {
      departureTime: pairs[0].time,
      arrivalTime: pairs[1].time,
      date: pairs[0].date || date,
    }
  }

  if (times.length >= 2) {
    return {
      departureTime: times[0],
      arrivalTime: times[1],
      date,
    }
  }

  if (pairs.length === 1 && times.length >= 2) {
    return {
      departureTime: times[0],
      arrivalTime: times[1],
      date: pairs[0].date || date,
    }
  }

  if (pairs.length === 1) {
    return {
      departureTime: times[0] || pairs[0].time,
      arrivalTime: times[1] || '',
      date: pairs[0].date || date,
    }
  }

  return {
    departureTime: times[0] || '',
    arrivalTime: times[1] || '',
    date,
  }
}

/**
 * Horarios de UN tramo: texto entre vuelo anterior y siguiente.
 * Usa las ÚLTIMAS 2 horas del bloque (salida/llegada de ESTE vuelo, no del anterior).
 */
function extractScheduleForLegBlock(legBlock: string): LegSchedule {
  const cleaned = stripDurationLines(legBlock)
  const flat = cleaned.replace(/\s+/g, ' ')

  const allPairs = extractTimeDatePairs(cleaned, flat)
  if (allPairs.length >= 2) {
    const last = allPairs.slice(-2)
    return {
      departureTime: last[0].time,
      arrivalTime: last[1].time,
      date: last[0].date,
    }
  }

  const allTimes = filterScheduleTimes(extractValidTimes(cleaned), flat)
  if (allTimes.length >= 2) {
    const last = allTimes.slice(-2)
    const dates = extractGdsDates(flat)
    return {
      departureTime: last[0],
      arrivalTime: last[1],
      date: dates[dates.length - 1] || dates[0] || '',
    }
  }

  return scheduleFromPairsAndTimes(allPairs, allTimes, flat)
}

function extractGdsDates(text: string) {
  const dates: string[] = []
  const regex = /\b(\d{1,2}[A-Za-z]{3}\d{4})\b/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const d = parseGdsDateToken(m[1])
    if (d && !dates.includes(d)) dates.push(d)
  }
  return dates
}

export function isGdsTableFormat(text: string) {
  const upper = text.toUpperCase()
  const flightHits = findKnownFlightNumbers(text).length
  const hasGdsDate = /\b\d{1,2}[A-Z]{3}\d{4}\b/.test(upper)
  const hasTableHeader = /FROM/i.test(upper) && /TO/i.test(upper) && /FLIGHT/i.test(upper)
  const hasAirportNames =
    /INTL|EL DORADO|ARAGON|PINILLA|CORDOVA|JORGE CHAVEZ|EZEIZA|MATECANA|LATAM/.test(upper)

  return (
    (flightHits >= 2 && (hasGdsDate || hasAirportNames)) ||
    (flightHits >= 1 && hasTableHeader) ||
    (flightHits >= 1 && hasGdsDate && hasAirportNames)
  )
}

export function parseGdsItineraryTable(
  text: string,
  bookingCode = ''
): FlightSegment[] {
  if (!isGdsTableFormat(text)) return []

  const flightMatches = findKnownFlightNumbers(text)

  if (flightMatches.length === 0) return []

  const flights: FlightSegment[] = []

  for (let i = 0; i < flightMatches.length; i++) {
    const flightNumber = flightMatches[i].flightNumber
    const pos = flightMatches[i].index
    const blockEnd =
      i + 1 < flightMatches.length ? flightMatches[i + 1].index : text.length

    const prevFlightEnd =
      i === 0
        ? 0
        : flightMatches[i - 1].index + flightMatches[i - 1].flightNumber.length

    const legBlock = text.slice(prevFlightEnd, blockEnd)

    // Ciudades: entre el vuelo anterior y este (columnas From / To)
    const cityWindow = text.slice(prevFlightEnd, pos)
    const cities = extractCitiesInOrder(cityWindow)
    if (cities.length < 2) continue

    const origin = formatCityLabel(cities[cities.length - 2])
    const destination = formatCityLabel(cities[cities.length - 1])

    const schedule = extractScheduleForLegBlock(legBlock)

    let airline = airlineFromFlightNumber(flightNumber) || detectAirlineFromText(legBlock)

    const flight: FlightSegment = {
      segment: i + 1,
      airline: airline || 'Aerolinea',
      flightNumber,
      origin,
      destination,
      date: schedule.date,
      departureTime: schedule.departureTime,
      arrivalTime: schedule.arrivalTime,
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

    flights.push(flight)
  }

  return flights
}
