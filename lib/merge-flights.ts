import { FlightSegment } from '@/lib/types'

function norm(value: string) {
  return (value || '').trim().toUpperCase()
}

/** Fecha canónica DD/MM/YYYY para comparar ISO vs DD/MM/YYYY. */
export function normalizeDateKey(date: string) {
  if (!date) return ''
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const dmy = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`
  return date.trim()
}

export function flightSegmentKey(
  f: Pick<
    FlightSegment,
    'origin' | 'destination' | 'date' | 'departureTime' | 'arrivalTime' | 'flightNumber'
  >
) {
  return [
    norm(f.origin),
    norm(f.destination),
    normalizeDateKey(f.date || ''),
    f.departureTime || '',
    f.arrivalTime || '',
    norm(f.flightNumber),
  ].join('|')
}

export function isEmptyFlightSegment(f: FlightSegment) {
  return !norm(f.origin) && !norm(f.destination) && !norm(f.flightNumber)
}

function findMatchingIndex(merged: FlightSegment[], flight: FlightSegment) {
  const fn = norm(flight.flightNumber)
  if (fn) {
    const byNumber = merged.findIndex(f => norm(f.flightNumber) === fn)
    if (byNumber >= 0) return byNumber
  }

  const key = flightSegmentKey(flight)
  return merged.findIndex(f => flightSegmentKey(f) === key)
}

function enrichSegment(existing: FlightSegment, incoming: FlightSegment): FlightSegment {
  const pick = (a: string | undefined, b: string | undefined) =>
    (b || '').trim() ? b! : (a || '').trim() ? a! : ''

  return {
    ...existing,
    airline: pick(existing.airline, incoming.airline),
    flightNumber: pick(existing.flightNumber, incoming.flightNumber),
    bookingCode: pick(existing.bookingCode, incoming.bookingCode),
    origin: pick(existing.origin, incoming.origin),
    destination: pick(existing.destination, incoming.destination),
    date: pick(existing.date, incoming.date),
    departureTime: pick(existing.departureTime, incoming.departureTime),
    arrivalTime: pick(existing.arrivalTime, incoming.arrivalTime),
    arrivalDate: incoming.arrivalDate || existing.arrivalDate,
    arrivalNextDay: incoming.arrivalNextDay ?? existing.arrivalNextDay,
  }
}

export type MergeFlightResult = {
  segments: FlightSegment[]
  addedCount: number
}

/** Une segmentos sin duplicar; devuelve cuántos segmentos nuevos se agregaron. */
export function mergeFlightSegments(
  existing: FlightSegment[],
  incoming: FlightSegment[]
): MergeFlightResult {
  const merged = [...existing.filter(f => !isEmptyFlightSegment(f))]
  let addedCount = 0

  for (const flight of incoming) {
    if (isEmptyFlightSegment(flight)) continue

    const matchIdx = findMatchingIndex(merged, flight)
    if (matchIdx >= 0) {
      merged[matchIdx] = enrichSegment(merged[matchIdx], flight)
      continue
    }

    merged.push({ ...flight })
    addedCount++
  }

  return {
    segments: merged.map((f, index) => ({ ...f, segment: index + 1 })),
    addedCount,
  }
}
