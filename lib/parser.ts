// src/lib/parser.ts

import { Itinerary, FlightSegment } from '@/lib/types'

function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function detectCity(text: string, cityMap: Record<string, string>) {
  const normalized = normalize(text)
  for (const city in cityMap) {
    if (normalized.includes(city)) {
      return cityMap[city]
    }
  }
  return null
}

export function parseItinerary(texts: string[]): Itinerary {
  const text = texts.join('\n')

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const cityToIata: Record<string, string> = {
    bogota: 'BOG',
    madrid: 'MAD',
    lima: 'LIM',
    miami: 'MIA',
    panama: 'PTY',
    cali: 'CLO',
    medellin: 'MDE'
  }

  // ==========================
  // PASAJERO
  // ==========================
  let passengerName = 'Pasajero'

  for (const line of lines) {
    if (/\(Nombre\)|\(Apellidos\)/i.test(line)) {
      passengerName = line
        .replace(/^\d+\s*/, '')
        .replace(/\(Nombre\)|\(Apellidos\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
      break
    }
  }

 // ==========================
// BOOKING CODE (PNR SEGURO)
// ==========================
const bookingCodes: { airline: string; code: string }[] = []

const fullTextUpper = text.toUpperCase()

// Solo detectar si está etiquetado
const labeledRegex =
  /(PNR|LOCALIZADOR|CODIGO DE RESERVA|CÓDIGO DE RESERVA)[^\n]{0,40}?\b([A-Z0-9]{5,6})\b/

const labeledMatch = fullTextUpper.match(labeledRegex)

if (labeledMatch) {
  const code = labeledMatch[2]

  // filtros anti-basura OCR
  if (
    /^[A-Z0-9]{5,6}$/.test(code) &&
    !/DIRECTO|BASICO|TURISTA|RESERV|CHECK|NUMERO/i.test(code)
  ) {
    bookingCodes.push({
      airline: 'Desconocida',
      code
    })
  }
}


  // ==========================
  // VUELOS
  // ==========================
  const flights: FlightSegment[] = []
  let segmentCounter = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!line.includes('-')) continue

    const clean = line.split('|')[0]

    const origin = detectCity(clean, cityToIata)
    const destination = detectCity(clean.split('-')[1] || '', cityToIata)

    if (!origin || !destination || origin === destination) continue

    let airline: string | null = null
    let flightNumber: string | null = null
    let date: string | null = null
    let departureTime: string | null = null
    let arrivalTime: string | null = null

    for (let j = i; j < i + 12 && j < lines.length; j++) {
      const l = lines[j]

      // ======================
      // 1️⃣ DETECTAR VUELO
      // ======================

      // Caso normal: IB152
      let flightMatch = l.match(/\b([A-Z]{2})(\d{2,4})\b/)

      // Caso OCR sucio: Iberia 18152
      if (!flightMatch) {
        const ibMatch = l.match(/Iberia\s+(\d{2,5})/i)
        if (ibMatch) {
          flightMatch = ['IB' + ibMatch[1], 'IB', ibMatch[1]]
        }
      }

      if (flightMatch && !flightNumber) {
        const AIRLINES: Record<string, string> = {
          AV: 'Avianca',
          IB: 'Iberia',
          UX: 'Air Europa',
          AA: 'American Airlines',
          CM: 'Copa Airlines',
          LA: 'LATAM'
        }

        flightNumber = flightMatch[0]
        airline = AIRLINES[flightMatch[1]] || 'Aerolínea'
      }

      // ======================
      // 2️⃣ FECHA
      // ======================
      const dateMatch = l.match(
        /(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})/i
      )

      if (dateMatch && !date) {
        const months: Record<string, string> = {
          enero: '01', febrero: '02', marzo: '03', abril: '04',
          mayo: '05', junio: '06', julio: '07', agosto: '08',
          septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
        }

        const day = dateMatch[1].padStart(2, '0')
        const month = months[dateMatch[2].toLowerCase()]
        const year = dateMatch[3]

        if (month) date = `${day}/${month}/${year}`
      }

      // ======================
      // 3️⃣ HORAS
      // ======================
      const timeMatch = l.match(/(\d{2}:\d{2})\s+([A-Z]{3})/)

      if (timeMatch) {
        if (timeMatch[2] === origin && !departureTime) {
          departureTime = timeMatch[1]
        }

        if (timeMatch[2] === destination && !arrivalTime) {
          arrivalTime = timeMatch[1]
        }
      }
    }

    // Solo crear vuelo si está completo
    if (
      airline &&
      flightNumber &&
      date &&
      departureTime &&
      arrivalTime
    ) {
      const flight: FlightSegment = {
        segment: segmentCounter++,
        airline,
        flightNumber,
        origin,
        destination,
        date,
        departureTime,
        arrivalTime,
        bookingCode: bookingCodes[0]?.code
      }

      if (arrivalTime < departureTime) {
        flight.arrivalNextDay = true

        const [d, m, y] = date.split('/').map(Number)
        const dt = new Date(y, m - 1, d)
        dt.setDate(dt.getDate() + 1)

        flight.arrivalDate =
          `${String(dt.getDate()).padStart(2, '0')}/` +
          `${String(dt.getMonth() + 1).padStart(2, '0')}/` +
          `${dt.getFullYear()}`
      }

      flights.push(flight)
    }
  }
// Asignar aerolínea del primer vuelo al bookingCode
if (bookingCodes.length > 0 && flights.length > 0) {
  bookingCodes[0].airline = flights[0].airline
}

  return {
  passengers: [
    { fullName: passengerName }
  ],
  bookingCodes,
  flights,
  baggage: {
    personalItem: true,
    cabin10kg: true,
    checked23kg: !/sin equipaje facturado/i.test(text)
  }
}
}
