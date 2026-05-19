/** Prefijos IATA de aerolínea → nombre en el formulario. */
export const AIRLINE_BY_PREFIX: Record<string, string> = {
  AV: 'Avianca',
  LA: 'LATAM',
  LP: 'LATAM',
  JJ: 'LATAM',
  XL: 'LATAM',
  '4C': 'LATAM',
  JA: 'Jetsmart',
  JZ: 'Jetsmart',
  P5: 'Wingo',
  CM: 'Copa Airlines',
  IB: 'Iberia',
  UX: 'Air Europa',
  AA: 'American Airlines',
  W2: 'Word2fly',
}

const PREFIXES = Object.keys(AIRLINE_BY_PREFIX).sort((a, b) => b.length - a.length)

export function flightNumberPrefix(flightNumber: string) {
  const upper = (flightNumber || '').trim().toUpperCase()
  if (upper.startsWith('P5')) return 'P5'
  for (const prefix of PREFIXES) {
    if (upper.startsWith(prefix)) return prefix
  }
  return upper.slice(0, 2)
}

export function airlineFromFlightNumber(flightNumber: string) {
  return AIRLINE_BY_PREFIX[flightNumberPrefix(flightNumber)] || ''
}

const FLIGHT_PREFIX_PATTERN =
  '(?:4C|P5|JA|JZ|LA|LP|JJ|XL|AV|CM|IB|UX|AA|W2)'

/** "JA 772" → "JA772" (solo prefijos de aerolínea; no tocar horas 05:40). */
export function normalizeFlightNumberSpacing(text: string) {
  return text.replace(
    new RegExp(`\\b(${FLIGHT_PREFIX_PATTERN})\\s*-?\\s*(\\d{2,4})\\b`, 'gi'),
    '$1$2'
  )
}

export function detectAirlineFromText(text: string) {
  if (/jetsmart|jet\s*smart/i.test(text)) return 'Jetsmart'
  if (/\bwingo\b/i.test(text)) return 'Wingo'
  if (/aero\s*republica/i.test(text)) return 'Wingo'
  if (/latam/i.test(text)) return 'LATAM'
  if (/avianca/i.test(text)) return 'Avianca'

  const operated = text.match(
    /(?:operado|operated|marketed)\s+(?:por|by)\s*:?\s*([A-Za-z0-9\s]+?)(?:\n|,|\.|fare|booking|status|$)/i
  )
  if (operated) {
    const name = operated[1].toLowerCase()
    if (name.includes('jetsmart') || name.includes('jet smart')) return 'Jetsmart'
    if (name.includes('wingo') || name.includes('aero republica')) return 'Wingo'
    if (name.includes('latam')) return 'LATAM'
    if (name.includes('avianca')) return 'Avianca'
    if (name.includes('copa')) return 'Copa Airlines'
  }

  return ''
}

/** Números de vuelo conocidos: LA1234, 4C1234, AV9218, etc. */
export function isJetSmartFlightNumber(flightNumber: string) {
  const u = (flightNumber || '').toUpperCase()
  return u.startsWith('JA') || u.startsWith('JZ')
}

export function isWingoFlightNumber(flightNumber: string) {
  return (flightNumber || '').toUpperCase().startsWith('P5')
}

export function findKnownFlightNumbers(text: string) {
  const matches: { flightNumber: string; index: number }[] = []
  const normalized = normalizeFlightNumberSpacing(text)
  const regex = /\b(4C\d{2,4}|P5\d{2,4}|[A-Z]{2}\d{2,4})\b/gi
  let m: RegExpExecArray | null

  while ((m = regex.exec(normalized)) !== null) {
    const flightNumber = m[1].toUpperCase()
    const prefix = flightNumberPrefix(flightNumber)
    if (!AIRLINE_BY_PREFIX[prefix]) continue
    matches.push({ flightNumber, index: m.index ?? 0 })
  }

  return matches
}
