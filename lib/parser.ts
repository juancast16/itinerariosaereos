// src/lib/parser.ts

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
])

function isInvalidCityToken(value: string) {
  const n = normalize(value)
  return !n || INVALID_CITY_WORDS.has(n)
}

function cleanCity(value: string) {
  let city = cleanSpaces(value)
  city = city.replace(/^(de|desde)\s+/i, '')
  city = city.replace(/\s+(de|a)\s*$/i, '')
  return cleanSpaces(city)
}

function parseRouteFromLine(rawLine: string) {
  const raw = stripNoise(rawLine)
  if (!raw) return null

  const arrowMatch = raw.match(/^(.+?)\s*(?:->|→|-)\s*(.+)$/)
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

  return ''
}

function detectAirlineByCode(code: string) {
  const airlines: Record<string, string> = {
    AV: 'Avianca',
    IB: 'Iberia',
    UX: 'Air Europa',
    AA: 'American Airlines',
    CM: 'Copa Airlines',
    LA: 'LATAM',
    W2: 'Word2fly',
  }
  return airlines[code] || ''
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

export function parseItinerary(texts: string[]): Itinerary {
  const text = texts.join('\n')
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const passengers = parsePassengerLines(lines)
  const bookingCodes = parseBookingCodes(text)
  const flights = parseFlights(lines, bookingCodes)

  if (bookingCodes.length > 0 && flights.length > 0 && bookingCodes[0].airline === 'Desconocida') {
    bookingCodes[0].airline = flights[0].airline || 'Desconocida'
  }

  return {
    passengers,
    bookingCodes,
    flights,
    baggage: {
      personalItem: true,
      cabin10kg: true,
      checked23kg: !/sin equipaje facturado/i.test(normalize(text)),
    },
  }
}