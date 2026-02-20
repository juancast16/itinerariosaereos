'use client'

import { useState } from 'react'
import { airlineAdapter } from './adapters/airline'
import { FlightSegment, Itinerary } from '@/lib/types'

export default function VoucherPage() {
  const [result, setResult] = useState<Itinerary | null>(null)

  async function handleGenerate() {
  const rawData = {
    bookingCode: 'CWDG4Z',
    passengerName: 'Brigittebanesa Morera Diaz',
    flights: [
      {
        origin: 'BOG - CLO',
        destination: 'MAD',
        departureDate: '2026-02-28',
        departureTime: '19:35',
        airline: 'Avianca',
        flightNumber: 'AV8463 - AV014',
        baggage: '1 x 23kg'
      }
    ],
    remarks: ['Presentarse 3 horas antes']
  }

  const itinerary = airlineAdapter(rawData)

  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(itinerary)
  })

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  window.open(url)
}


  return (
    <div style={{ padding: 40 }}>
      <h1>Prueba Adapter – Airline</h1>

      <button onClick={handleGenerate}>
        Generar Itinerario
      </button>

      {result && (
        <pre style={{ marginTop: 20 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  )
}
