import fs from 'fs'

// ==================
// LEER TEXTO OCR
// ==================
const text = fs.readFileSync('./ocr/ocr-output.txt', 'utf8')

const lines = text
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)

// ==================
// UTILIDADES
// ==================
function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isRealPNR(code: string) {
  return /^[A-Z0-9]{5,6}$/.test(code) && !/reserv|sitio/i.test(code)
}

const cityToIata: Record<string, string> = {
  bogota: 'BOG',
  madrid: 'MAD',
  cali: 'CLO',
  medellin: 'MDE',
  lima: 'LIM',
  miami: 'MIA',
  panama: 'PTY'
}

function detectCity(line: string) {
  const n = normalize(line)
  for (const c in cityToIata) {
    if (n.includes(c)) return cityToIata[c]
  }
  return null
}

// ==================
// PASAJERO + PNR
// ==================
let passengerName: string | null = null
const bookingCodes: { airline: string | null; code: string }[] = []

for (const l of lines) {
  if (!passengerName && /\(nombre\)|\(apellidos\)/i.test(l)) {
    passengerName = l
      .replace(/^\d+\s*/, '')
      .replace(/\(.*?\)/g, '')
      .trim()
  }

  const pnr = l.match(/\b(PNR|Localizador).*?\b([A-Z0-9]{5,6})\b/i)
  if (pnr && isRealPNR(pnr[2])) {
    if (!bookingCodes.find(b => b.code === pnr[2])) {
      bookingCodes.push({ airline: null, code: pnr[2] })
    }
  }
}

// ==================
// VUELOS
// ==================
const flights: any[] = []
let current: any = null

for (const l of lines) {
  // Ruta + fecha
  if (l.includes('-')) {
    const parts = l.split('|')[0]
    const [a, b] = parts.split('-').map(p => p.trim())
    const origin = detectCity(a)
    const destination = detectCity(b)

    if (origin && destination) {
      if (current) flights.push(current)

      current = {
        airline: null,
        flightNumber: null,
        origin,
        destination,
        date: null,
        departureTime: null,
        arrivalTime: null,
        bookingCode: bookingCodes[0]?.code || null
      }

      const dateMatch = l.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i)
      if (dateMatch) {
        const months: any = {
          enero: '01', febrero: '02', marzo: '03', abril: '04',
          mayo: '05', junio: '06', julio: '07', agosto: '08',
          septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
        }
        const d = dateMatch[1].padStart(2, '0')
        const m = months[dateMatch[2].toLowerCase()]
        const y = dateMatch[3]
        if (m) current.date = `${d}/${m}/${y}`
      }
    }
  }

  if (!current) continue

  // Horas
  const time = l.match(/(\d{2}:\d{2})\s+([A-Z]{3})/)
  if (time) {
    if (time[2] === current.origin) current.departureTime = time[1]
    if (time[2] === current.destination) current.arrivalTime = time[1]
  }

  // Aerolínea + vuelo
  const fn = l.match(/([A-Z]{2}\d{2,4})/)
  if (fn && !current.flightNumber) {
    current.flightNumber = fn[1]
    const code = fn[1].slice(0, 2)
    const airlines: any = {
      IB: 'Iberia',
      AV: 'Avianca',
      LA: 'LATAM',
      UX: 'Air Europa',
      AA: 'American Airlines'
    }
    current.airline = airlines[code] || null
  }
}

if (current) flights.push(current)

// ==================
// POST PROCESO
// ==================
flights.forEach((f, i) => {
  f.segment = i + 1
  f.arrivalNextDay = f.arrivalTime && f.departureTime && f.arrivalTime < f.departureTime
  if (f.arrivalNextDay && f.date) {
    const [d, m, y] = f.date.split('/').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + 1)
    f.arrivalDate = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  }
})

// ==================
// RESULTADO
// ==================
const itinerary = {
  passenger: { fullName: passengerName },
  bookingCodes,
  flights,
  baggage: {
    personalItem: true,
    cabin10kg: true,
    checked23kg: !/sin equipaje facturado/i.test(text)
  }
}

console.log(JSON.stringify(itinerary, null, 2))
