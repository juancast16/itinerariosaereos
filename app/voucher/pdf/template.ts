import { Itinerary } from '@/lib/types'
import fs from 'fs'
import path from 'path'

type TripGroup = {
  pnr: string
  segments: Itinerary['flights']
}

export function renderPdfTemplate(itinerary: Itinerary): string {
  const cssPath = path.join(process.cwd(), 'pdf-assets/styles.css')
  const styles = fs.readFileSync(cssPath, 'utf8')

  const logoSrc = `data:image/png;base64,${fs.readFileSync(
    path.join(process.cwd(), 'pdf-assets/logo.png'),
    'base64'
  )}`

  const icon = (name: string) =>
    `data:image/png;base64,${fs.readFileSync(
      path.join(process.cwd(), `pdf-assets/${name}.png`),
      'base64'
    )}`

  const AIRLINE_LOGOS: Record<string, string> = {
    Avianca: 'avianca.png',
    Iberia: 'iberia.png',
    LATAM: 'latam.png',
    'Air Europa': 'air_europa.png',
    'Copa Airlines': 'copa.png',
    Wingo: 'wingo.png',
    Jetsmart: 'jetsmart.png',
    Wizz: 'wizz.png',
    Word2fly: 'word2fly.png',
  }

  const AIRLINE_LOGO_SCALE: Record<string, number> = {
    Iberia: 2,
  }

  function airlineLogo(airline: string) {
    try {
      const fileName = AIRLINE_LOGOS[airline]
      if (!fileName) return null

      return `data:image/png;base64,${fs.readFileSync(
        path.join(process.cwd(), `pdf-assets/airlines/${fileName}`),
        'base64'
      )}`
    } catch {
      return null
    }
  }

  function formatShortDate(dateStr: string) {
    if (!dateStr) return ''
    const date = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(date.getTime())) return dateStr
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    }).format(date)
  }

  function formatCity(value: string) {
    const city = (value || '').trim()
    return city || 'Sin ciudad'
  }

  function calcLayoverMinutes(prev: Itinerary['flights'][number], next: Itinerary['flights'][number]) {
    const prevDate = prev.arrivalDate || prev.date
    const prevDateTime = new Date(`${prevDate}T${prev.arrivalTime}:00`)
    const nextDateTime = new Date(`${next.date}T${next.departureTime}:00`)
    if (Number.isNaN(prevDateTime.getTime()) || Number.isNaN(nextDateTime.getTime())) return null

    const diff = Math.max(0, Math.round((nextDateTime.getTime() - prevDateTime.getTime()) / 60000))
    return diff
  }

  function formatTime12h(timeStr: string) {
    const value = (timeStr || '').trim()
    const match = value.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return value || '--:--'

    const hour24 = Number(match[1])
    const minute = match[2]
    if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return value || '--:--'

    const suffix = hour24 >= 12 ? 'PM' : 'AM'
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    return `${hour12}:${minute} ${suffix}`
  }

  function formatMinutes(minutes: number | null) {
    if (minutes === null) return 'Tiempo de conexion por confirmar'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m} min`
    if (m === 0) return `${h} h`
    return `${h} h ${m} min`
  }

  function buildTrips() {
    const sorted = [...(itinerary.flights || [])].sort((a, b) => a.segment - b.segment)
    const trips: TripGroup[] = []
    if (sorted.length === 0) return trips

    let current: TripGroup = {
      pnr: sorted[0].bookingCode || 'SIN-PNR',
      segments: [sorted[0]],
    }

    for (let i = 1; i < sorted.length; i++) {
      const flight = sorted[i]
      const prev = current.segments[current.segments.length - 1]
      const samePnr = (flight.bookingCode || 'SIN-PNR') === current.pnr
      const isConnection = prev.destination === flight.origin

      if (samePnr && isConnection) {
        current.segments.push(flight)
      } else {
        trips.push(current)
        current = {
          pnr: flight.bookingCode || 'SIN-PNR',
          segments: [flight],
        }
      }
    }

    trips.push(current)
    return trips
  }

  const tripGroups = buildTrips()
  const shouldMoveBaggageToNextPage = (itinerary.passengers?.length || 0) >= 6

  const tripsHtml = tripGroups
    .map((trip, tripIndex) => {
      const title =
        tripIndex === 0 ? 'Viaje de ida' : tripIndex === 1 ? 'Viaje de vuelta' : `Trayecto ${tripIndex + 1}`

      const routeSummary = `${formatCity(trip.segments[0].origin)} -> ${formatCity(trip.segments[trip.segments.length - 1].destination)}`
      const hasScale = trip.segments.length > 1

      const segmentBlocks = trip.segments
        .map((flight, index) => {
          const logo = airlineLogo(flight.airline)
          const logoScale = AIRLINE_LOGO_SCALE[flight.airline] || 1
          const isLast = index === trip.segments.length - 1
          const connection = !isLast ? trip.segments[index + 1] : null
          const layover = connection ? calcLayoverMinutes(flight, connection) : null

          return `
            <div class="segment-card">
              <div class="segment-head">
                <div class="segment-route">${formatCity(flight.origin)} -> ${formatCity(flight.destination)}</div>
                <div class="segment-flight-line">
                  ${
                    logo
                      ? `<span class="segment-logo"><img src="${logo}" alt="${flight.airline}" style="transform: scale(${logoScale});" /></span>`
                      : `<span class="segment-airline-text">${flight.airline}</span>`
                  }
                  <span class="segment-flight-number">Vuelo ${flight.flightNumber || '-'}</span>
                </div>
              </div>

              <div class="segment-main">
                <div class="airport-col">
                  <div class="airport-label">Origen</div>
                  <div class="airport-code">${formatCity(flight.origin)}</div>
                  <div class="airport-time">${formatTime12h(flight.departureTime)}</div>
                </div>

                <div class="plane-col">&#9992;</div>

                <div class="airport-col airport-col-right">
                  <div class="airport-label">Destino</div>
                  <div class="airport-code">${formatCity(flight.destination)}</div>
                  <div class="airport-time">${formatTime12h(flight.arrivalTime)}</div>
                </div>
              </div>

              <div class="segment-foot">
                <span>Fecha ${formatShortDate(flight.date)}</span>
                <span>PNR ${flight.bookingCode || 'SIN-PNR'}</span>
              </div>
            </div>
            ${
              connection
                ? `
                  <div class="connection-card">
                    <div class="connection-title">Escala</div>
                    <div class="connection-airport">${formatCity(flight.destination)}</div>
                    <div class="connection-time">${formatMinutes(layover)}</div>
                  </div>
                `
                : ''
            }
          `
        })
        .join('')

      return `
        <section class="trip-block">
          <div class="trip-top">
            <div class="trip-badge">${title}</div>
            <div class="trip-route">${routeSummary}</div>
            <div class="trip-meta">${hasScale ? 'Con escala' : 'Directo'}</div>
          </div>
          <div class="segments-row">
            ${segmentBlocks}
          </div>
        </section>
      `
    })
    .join('')

  return `
<html>
<head>
  <style>${styles}</style>
</head>

<body>

<header>
  <div class="header-inner">

    <div class="header-left">
      <img src="${logoSrc}" />
      <div class="company-name">ConexionTrip Agencia de Viajes</div>
      <div class="company-legal">NIT: 901.910.082 | RNT: 80741</div>
      <div class="company-note">
        Documento informativo - No valido como tiquete aereo
      </div>
    </div>

    <div class="header-right">
      <div class="reservation-label">Codigo(s) de reserva</div>
      ${
        itinerary.bookingCodes?.map(
          b => `<div class="reservation-code">${b.airline}: ${b.code}</div>`
        ).join('') || ''
      }
    </div>

  </div>
</header>

<main>

<h1 style="font-size:20px; margin-bottom:20px;">
  Itinerario de viaje
</h1>

<section>
  <h2>Pasajeros</h2>
  <div class="passenger-list">
    ${
      itinerary.passengers
        .map(
          (p, index) => `
            <div class="passenger-row">
              <span class="passenger-label">Pasajero ${index + 1}</span>
              <span class="passenger-name">${(p.fullName || 'SIN NOMBRE').toUpperCase()}</span>
            </div>
          `
        )
        .join('')
    }
  </div>
</section>

<section>
  <h2>Detalle de vuelos</h2>
  ${tripsHtml || '<p>No hay segmentos cargados.</p>'}
</section>

<section class="equipaje ${shouldMoveBaggageToNextPage ? 'force-page-break' : ''}">
  <h2>Equipaje permitido</h2>

  <div class="equipaje-grid">
    ${
      itinerary.baggage.personalItem
        ? `<div class="equipaje-linea">
            <img src="${icon('personal')}" />
            <span>Articulo personal</span>
          </div>` : ''
    }

    ${
      itinerary.baggage.cabin10kg
        ? `<div class="equipaje-linea">
            <img src="${icon('mano')}" />
            <span>Equipaje de cabina<br/>hasta 10 kg</span>
          </div>` : ''
    }

    ${
      itinerary.baggage.checked23kg
        ? `<div class="equipaje-linea">
            <img src="${icon('bodega')}" />
            <span>Equipaje de bodega<br/>hasta 23 kg</span>
          </div>` : ''
    }
  </div>
</section>

${shouldMoveBaggageToNextPage ? '' : '<div class="page-break"></div>'}

<section class="observaciones">
  <h2>Observaciones importantes</h2>
  <ul>
    <li>"Presentarse 2 horas antes para vuelos nacionales y 3 horas antes para vuelos internacionales de salida de su vuelo, evítese contratiempos.</li>
    <li>Recuerde que su equipaje permitido está en la parte de abajo de este documento, recuerde que su artículo personal no debe tener rueditas, debe caber debajo del asiento delantero y tener en cuenta las medidas.</li>
    <li>ConexiónTrip agencia de viajes no es responsable por modificaciones, cambios o cancelaciones por parte de las aerolíneas, ya que esto es directamente con ellas y con la Aeronáutica Civil según los slots disponibles por aeropuertos.</li>
    <li>Al momento de su arribo al destino debe inmediatamente contactarse para continuar con todas las indicaciones de su itinerario de viaje.</li>
    <li>Leer antes de su viaje todas las indicaciones escritas en las observaciones de sus vouchers y realizar todas las preguntas pertinentes antes y durante el viaje.</li>
    <li>Solicitar sus Check-in y Check-out de los vuelos de 1 a 2 días antes de la fecha del mismo, si no tenga en cuenta que este puede tener costo en el counter de la aerolínea.</li>
    <li>Revise la información de vuelos desde el momento en que es entregada. Luego de emitido un vuelo, si no se reporta algún error con anticipación, el cliente se hará responsable de las penalidades por parte de la aerolínea.</li>
    <li>LOS TIQUETES NO TIENEN REEMBOLSO UNA VEZ EMITIDOS POR LA AEROLÍNEA.</li>
    <li>TODO CAMBIO DE FECHA O RUTA SE DEBE COTIZAR Y PAGAR LUEGO DE RECIBIDA LA COTIZACION SOLICITADA - CAMBIO DE NOMBRE EN ALGUNAS AEROLÍNEAS NO ESTÁN PERMITIDOS Y EN OTRAS TIENE COSTO, POR FAVOR TENERLO EN CUENTA.</li>
  </ul>
</section>

</main>

<footer class="footer">
  <div class="footer-grid">

    <div class="footer-col">
      <div class="footer-item">
        <img src="${icon('whatsapp')}" />
        <div>+57 302 331 11 07<br/>+57 318 812 64 32</div>
      </div>
    </div>

    <div class="footer-col">
      <div class="footer-item">
        <img src="${icon('location')}" />
        <div>Calle 9 #6-12<br/>Barrio Belalcazar</div>
      </div>
    </div>

    <div class="footer-col">
      <div class="footer-item">
        <img src="${icon('facebook')}" />
        <div>conexiontrip</div>
      </div>
    </div>

    <div class="footer-col">
      <div class="footer-item">
        <img src="${icon('instagram')}" />
        <div>@conexiontripsas</div>
      </div>
    </div>

  </div>
</footer>

</body>
</html>
`
}
