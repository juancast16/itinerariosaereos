// src/app/voucher/pdf/template.ts

import { Itinerary } from '@/lib/types'
import fs from 'fs'
import path from 'path'

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
  Word2fly: 'word2fly.png'

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
      <div class="company-name">ConexiónTrip Agencia de Viajes</div>
      <div class="company-legal">NIT: 901.910.082 | RNT: 80741</div>
      <div class="company-note">
        Documento informativo – No válido como tiquete aéreo
      </div>
    </div>

    <div class="header-right">
      <div class="reservation-label">Código(s) de reserva</div>
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
  Itinerario de Vuelo
</h1>

<section>
  <h2>Pasajeros</h2>
  <p><strong>${
    itinerary.passengers
      .map(p => p.fullName)
      .join(', ')
  }</strong></p>
</section>

<section>
  <h2>Detalle de Vuelos</h2>
  <table>
    <thead>
      <tr>
        <th>Tramo</th>
        <th>Ruta</th>
        <th>Aerolínea</th>
        <th>Vuelo</th>
        <th>Salida</th>
        <th>Llegada</th>
      </tr>
    </thead>
    <tbody>
      ${itinerary.flights.map(f => `
        <tr>
          <td>${f.segment}</td>
          <td>${f.origin} → ${f.destination}</td>
          <td class="airline-cell">
  ${
    airlineLogo(f.airline)
      ? `<div class="airline-logo-wrapper">
           <img src="${airlineLogo(f.airline)}" />
         </div>`
      : f.airline
  }
</td>
          <td>${f.flightNumber}</td>
          <td>${f.date} ${f.departureTime}</td>
          <td>
            ${f.arrivalDate || f.date} ${f.arrivalTime}
            ${f.arrivalNextDay ? '<span class="next-day">(+1)</span>' : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</section>

<section class="equipaje">
  <h2>Equipaje Permitido</h2>

  <div class="equipaje-grid">
    ${
      itinerary.baggage.personalItem
        ? `<div class="equipaje-linea">
            <img src="${icon('personal')}" />
            <span>Artículo personal</span>
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

<div class="page-break"></div>

<section class="observaciones">
  <h2>Observaciones Importantes</h2>
  <ul>
    <li>"Presentarse 2 horas antes para vuelos nacionales y 3 horas antes para vuelos internacionales de salida de su vuelo, evítese contratiempos.</li>
    <li>Recuerde que su equipaje permitido esta en la parte de abajo de este documento, recuerde que su articulo personal no debe tener rueditas, debe caber debajo del asiento delantero y tener en cuenta las medidas.</li>
    <li>ConexiónTrip agencia de viajes no es responsable por modificaciones, cambios o cancelaciones por parte de las aerolíneas, ya que esto es directamente con ellas y con la Aeronáutica Civil según los slots disponibles por aeropuertos.</li>
    <li>Al momento de su arribo al destino debe inmediatamente contactarse para continuar con todas las indicaciones de su itinerario de viaje.</li>
    <li>Leer antes de su viaje todas las indicaciones escritas en las observaciones de sus vouchers y realizar todas las preguntas pertinentes antes y durante el viaje</li>
    <li>Solicitar sus Check-in y Check-out de los vuelos de 1 a 2 días antes de la fecha del mismo, si no tenga en cuenta que este puede tener costo en el counter de la aerolinea.</li>
    <li>Revise la información de vuelos desde el momento en que es entregada. Luego de emitido un vuelo, si no se reporta algún error con anticipación, el cliente se hará responsable de las penalidades por parte de la aerolínea.</li>
    <li>LOS TIQUETES NO TIENEN REEMBOLSO UNA VEZ EMITIDOS POR LA AEROLÍNEA.</li>
    <li>TODO CAMBIO DE FECHA O RUTA SE DEBE COTIZAR Y PAGAR LUEGO DE RECIBIDA LA COTIZACION SOLICITADA - CAMBIO DE NOMBRE EN ALGUNAS AEROLINEAS NO ESTAN PERMITIDOS Y EN OTRAS TIENE COSTO, POR FAVOR TENERLO EN CUENTA.</li>
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
        <div>Calle 9 #6-12<br/>Barrio Belalcázar</div>
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
