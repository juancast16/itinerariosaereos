export const cityToIata: Record<string, string> = {
  bogota: 'BOG',
  madrid: 'MAD',
  lima: 'LIM',
  miami: 'MIA',
  panama: 'PTY',
  cali: 'CLO',
  medellin: 'MDE'
}

export function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function detectCity(text: string) {
  const n = normalize(text)
  for (const c in cityToIata) {
    if (n.includes(c)) return cityToIata[c]
  }
  return null
}

export function parseDate(text: string) {
  const m = text.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i)
  if (!m) return null

  const months: any = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  }

  const day = m[1].padStart(2, '0')
  const month = months[m[2].toLowerCase()]
  const year = m[3]

  return month ? `${day}/${month}/${year}` : null
}

export function isRealPNR(code: string): boolean {
console.log('isRealPNR called with:', code)

  if (!code) return false

  const clean = code.trim().toUpperCase()

  // Debe tener letras Y números
  if (!/[A-Z]/.test(clean) || !/[0-9]/.test(clean)) return false

  // Longitud típica PNR
  if (clean.length < 5 || clean.length > 6) return false

  // Palabras prohibidas frecuentes en OCR
  const blacklist = [
    'RESERV',
    'RESERVA',
    'SITIO',
    'WEB',
    'LOCAL',
    'VUELO',
    'CHECK',
    'LINEA'
  ]

  return !blacklist.includes(clean)
}

