import fs from 'fs'

// ==================
// LEER TEXTO OCR
// ==================
const text = fs.readFileSync('./ocr/ocr-output.txt', 'utf8')

const lines = text
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)

const bookingCodes = []

// ==================
// UTILIDADES
// ==================
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function detectCity(text, cityMap) {
  const normalized = normalize(text)
  for (const city in cityMap) {
    if (normalized.includes(city)) {
      return cityMap[city]
    }
  }
  return null
}

// ==================
// MAPA CIUDAD → IATA
// ==================
const cityToIata = {
  bogota: 'BOG',
  madrid: 'MAD',
  lima: 'LIM',
  miami: 'MIA',
  panama: 'PTY',
  cali: 'CLO',
  medellin: 'MDE'
}

// ==================
// PASAJERO + BOOKING CODES
// ==================
let passengerName = null
let bookingCode = null

for (const line of lines) {

  // ---- PNR REAL ----
  const pnrMatch = line.match(/\b(PNR|Localizador).*?\b([A-Z0-9]{5,6})\b/i)
  if (pnrMatch) {
    const code = pnrMatch[2]
    if (!/reserv|sitio|web/i.test(code)) {
      if (!bookingCodes.find(b => b.code === code)) {
        bookingCodes.push({ airline: null, code })
      }
      bookingCode = code
    }
  }

  // ---- NOMBRE PASAJERO ----
  if (!passengerName && /\(Nombre\)|\(Apellidos\)/i.test(line)) {
    passengerName = line
      .replace(/^\d+\s*/, '')
      .replace(/\(Nombre\)|\(Apellidos\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

// ==================
// VUELOS (MULTI-SEGMENTO)
// ==================
const flights = []
let currentFlight = null

for (const line of lines) {

  // ---- NUEVO TRAYECTO ----
  if (line.includes('-')) {
    const routePart = line.split('|')[0]

    const origin = detectCity(routePart, cityToIata)
    const destination = detectCity(routePart.split('-')[1] || '', cityToIata)

    if (origin && destination && origin !== destination) {

      if (currentFlight) flights.push(currentFlight)

      currentFlight = {
        airline: null,
        flightNumber: null,
        origin,
        destination,
        date: null,
        departureTime: null,
        arrivalTime: null,
        bookingCode: bookingCode || null
      }

      // fecha en misma línea
      const dateMatch = line.match(/(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})/i)
      if (dateMatch) {
        const months = {
          enero: '01', febrero: '02', marzo: '03', abril: '04',
          mayo: '05', junio: '06', julio: '07', agosto: '08',
          septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
        }

        const day = dateMatch[1].padStart(2, '0')
        const month = months[dateMatch[2].toLowerCase()]
        const year = dateMatch[3]

        if (month) currentFlight.date = `${day}/${month}/${year}`
      }

      continue
    }
  }

  if (!currentFlight) continue

  // ---- FECHA EN OTRA LÍNEA ----
  if (!currentFlight.date) {
    const match = line.match(/(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})/i)
    if (match) {
      const months = {
        enero: '01', febrero: '02', marzo: '03', abril: '04',
        mayo: '05', junio: '06', julio: '07', agosto: '08',
        septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
      }

      const day = match[1].padStart(2, '0')
      const month = months[match[2].toLowerCase()]
      const year = match[3]

      if (month) currentFlight.date = `${day}/${month}/${year}`
    }
  }

  // ---- HORAS ----
  const timeMatch = line.match(/(\d{2}:\d{2})\s+([A-Z]{3})/)
  if (timeMatch) {
    if (timeMatch[2] === currentFlight.origin && !currentFlight.departureTime) {
      currentFlight.departureTime = timeMatch[1]
    }
    if (timeMatch[2] === currentFlight.destination && !currentFlight.arrivalTime) {
      currentFlight.arrivalTime = timeMatch[1]
    }
  }

  // ---- AEROLÍNEA + VUELO ----
  const flightMatch = line.match(/([A-Za-z]+)\s+([A-Z]{2}\d{2,4})/)
  if (flightMatch && !currentFlight.flightNumber) {
    currentFlight.airline = flightMatch[1]
    currentFlight.flightNumber = flightMatch[2]
  }
}

if (currentFlight) flights.push(currentFlight)

// ==================
// LIMPIEZA C1
// ==================
function cleanFlights(list) {
  return list.filter(f =>
    f.origin &&
    f.destination &&
    f.origin !== f.destination &&
    (f.flightNumber || f.airline) &&
    (f.departureTime || f.arrivalTime)
  )
}

function cleanBookingCodes(list) {
  const blacklist = ['reserv', 'sitio', 'web']
  return list.filter(b =>
    b.code &&
    b.code.length >= 5 &&
    b.code.length <= 6 &&
    !blacklist.includes(b.code.toLowerCase())
  )
}

const cleanFlightsList = cleanFlights(flights)
const cleanBookingCodesList = cleanBookingCodes(bookingCodes)

// ==================
// ORDEN + SEGMENTOS
// ==================
cleanFlightsList.sort((a, b) => {
  if (!a.date || !b.date) return 0
  const [da, ma, ya] = a.date.split('/').map(Number)
  const [db, mb, yb] = b.date.split('/').map(Number)
  return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db)
})

cleanFlightsList.forEach((f, i) => f.segment = i + 1)

// ==================
// OVERNIGHT
// ==================
for (const f of cleanFlightsList) {
  if (f.departureTime && f.arrivalTime && f.arrivalTime < f.departureTime) {
    f.arrivalNextDay = true
    if (f.date) {
      const [d, m, y] = f.date.split('/').map(Number)
      const dt = new Date(y, m - 1, d + 1)
      f.arrivalDate = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
    }
  }
}

// ==================
// EQUIPAJE
// ==================
const baggage = {
  personalItem: true,
  cabin10kg: true,
  checked23kg: !/sin equipaje facturado/i.test(text)
}

// ==================
// ITINERARIO FINAL
// ==================
const itinerary = {
  passenger: { fullName: passengerName },
  bookingCodes: cleanBookingCodesList,
  flights: cleanFlightsList,
  baggage
}

console.log(JSON.stringify(itinerary, null, 2))
