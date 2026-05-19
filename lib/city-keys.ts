/** Canonical IATA-style keys for matching cities across typos and variants. */
const CITY_ALIASES: Record<string, string> = {
  bogota: 'BOG',
  bog: 'BOG',
  medellin: 'MDE',
  mdellin: 'MDE',
  mde: 'MDE',
  cali: 'CLO',
  clo: 'CLO',
  sanandres: 'ADZ',
  andres: 'ADZ',
  adz: 'ADZ',
  madrid: 'MAD',
  lima: 'LIM',
  miami: 'MIA',
  panama: 'PTY',
  cartagena: 'CTG',
  barranquilla: 'BAQ',
  santiago: 'SCL',
  buenosaires: 'BUE',
  santamarta: 'SMR',
  pereira: 'PEI',
  cucuta: 'CUC',
  monteria: 'MTR',
  quito: 'UIO',
  guayaquil: 'GYE',
  armenia: 'AXM',
  neiva: 'NVA',
  cancun: 'CUN',
  mexico: 'MEX',
  mexicocity: 'MEX',
}

export const IATA_DISPLAY: Record<string, string> = {
  BOG: 'BOGOTA',
  MDE: 'MEDELLIN',
  CLO: 'CALI',
  ADZ: 'SAN ANDRES',
  MAD: 'MADRID',
  LIM: 'LIMA',
  MIA: 'MIAMI',
  PTY: 'PANAMA',
  CTG: 'CARTAGENA',
  BAQ: 'BARRANQUILLA',
  SCL: 'SANTIAGO',
  BUE: 'BUENOS AIRES',
  SMR: 'SANTA MARTA',
  PEI: 'PEREIRA',
  CUC: 'CUCUTA',
  MTR: 'MONTERIA',
  UIO: 'QUITO',
  GYE: 'GUAYAQUIL',
  AXM: 'ARMENIA',
  NVA: 'NEIVA',
  CUN: 'CANCUN',
  MEX: 'MEXICO',
}

const DISPLAY_BY_KEY = IATA_DISPLAY

export const KNOWN_IATA = new Set(Object.keys(IATA_DISPLAY))

export function normalizeCityKey(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export function resolveCityKey(value: string) {
  const key = normalizeCityKey(value)
  if (!key) return ''

  if (CITY_ALIASES[key]) return CITY_ALIASES[key]

  for (const [alias, code] of Object.entries(CITY_ALIASES)) {
    if (alias.length >= 4 && key.includes(alias)) return code
  }

  return key
}

export function citiesMatch(a: string, b: string) {
  const left = resolveCityKey(a)
  const right = resolveCityKey(b)
  if (!left || !right) return false
  return left === right
}

export function formatCityLabel(value: string) {
  const trimmed = (value || '').trim()
  if (!trimmed) return 'Sin ciudad'

  const upper = trimmed.toUpperCase()
  if (IATA_DISPLAY[upper]) return IATA_DISPLAY[upper]

  const canonical = DISPLAY_BY_KEY[resolveCityKey(trimmed)]
  return canonical || trimmed
}

export function cityFromIata(iata: string) {
  return IATA_DISPLAY[(iata || '').trim().toUpperCase()] || (iata || '').trim()
}
