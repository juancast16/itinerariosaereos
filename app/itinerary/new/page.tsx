'use client'

import { useState } from 'react'

const AIRLINES = [
  'Avianca',
  'Iberia',
  'LATAM',
  'Air Europa',
  'Copa Airlines',
  'Wingo',
  'Jetsmart',
  'Wizz',
  'Word2fly'
]


export default function NewItinerary() {

  const [passengers, setPassengers] = useState([
  { fullName: '' }
])
  const [airline, setAirline] = useState('')
  

  const [flights, setFlights] = useState([
  {
    airline: '',
    flightNumber: '',   // 👈 NUEVO
    bookingCode: '',
    origin: '',
    destination: '',
    date: '',
    departureTime: '',
    arrivalTime: ''
  }
])

const [baggage, setBaggage] = useState({
  personalItem: true,
  cabin10kg: true,
  checked23kg: false
})

const [isGenerating, setIsGenerating] = useState(false)
const [successMessage, setSuccessMessage] = useState('')


  function addFlight() {
    setFlights([
      ...flights,
      {
  airline: '',
  flightNumber: '',   // 👈 NUEVO
  bookingCode: '',
  origin: '',
  destination: '',
  date: '',
  departureTime: '',
  arrivalTime: ''
}
    ])
  }
  

  function removeFlight(index: number) {
    const updated = flights.filter((_, i) => i !== index)
    setFlights(updated)
  }

  function addPassenger() {
  setPassengers([
    ...passengers,
    { fullName: '' }
  ])
}

function removePassenger(index: number) {
  const updated = passengers.filter((_, i) => i !== index)
  setPassengers(updated)
}


  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()

  setIsGenerating(true)
  setSuccessMessage('')

  const itineraryData = {
    passengers: passengers,
    bookingCodes: Array.from(
      new Map(
        flights
          .filter(f => f.bookingCode)
          .map(f => [
            f.bookingCode,
            { airline: f.airline || airline, code: f.bookingCode }
          ])
      ).values()
    ),
    flights: flights.map((flight, index) => ({
      segment: index + 1,
      airline: flight.airline || airline,
      bookingCode: flight.bookingCode,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      date: flight.date,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime
    })),
    baggage: baggage
  }

  try {
    const response = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itineraryData)
    })

    if (!response.ok) {
      throw new Error('Error generando PDF')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'itinerario.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()

    setSuccessMessage('✅ PDF generado correctamente')
  } catch (error) {
    setSuccessMessage('❌ Hubo un error generando el PDF')
  } finally {
    setIsGenerating(false)
  }
}


  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 max-w-xl">

      <h2 className="text-xl font-bold">Pasajeros</h2>

{passengers.map((p, index) => (
  <div key={index} className="flex gap-2 items-center">

    <input
      className="border p-2 rounded w-full"
      placeholder={`Nombre pasajero ${index + 1}`}
      onChange={e => {
        const updated = [...passengers]
        updated[index].fullName = e.target.value
        setPassengers(updated)
      }}
    />

    {passengers.length > 1 && (
      <button
        type="button"
        onClick={() => removePassenger(index)}
        className="text-red-500 text-sm"
      >
        X
      </button>
    )}

  </div>
))}

<button
  type="button"
  onClick={addPassenger}
  className="bg-gray-200 p-2 rounded mt-2"
>
  ➕ Agregar pasajero
</button>

      <input
        placeholder="Aerolínea principal (opcional)"
        onChange={e => setAirline(e.target.value)}
      />

      <h2 className="text-xl font-bold mt-6">Segmentos</h2>
      <p className="text-sm text-gray-600">
        Para vuelos con escala: agrega cada tramo como un segmento nuevo y conserva el mismo PNR.
        Para tramos separados (otro tiquete): usa un PNR distinto.
      </p>

      {flights.map((flight, index) => (
        <div key={index} className="border p-4 rounded space-y-4">

  <h3 className="font-semibold text-lg">
    Segmento {index + 1}
  </h3>

  <div className="grid grid-cols-2 gap-4">

    <div>
      <label className="text-sm font-medium">Aerolínea</label>
<select
  className="w-full border p-2 rounded"
  onChange={e => {
    const updated = [...flights]
    updated[index].airline = e.target.value
    setFlights(updated)
  }}
>
  <option value="">Seleccionar aerolínea</option>
  {AIRLINES.map(a => (
    <option key={a} value={a}>
      {a}
    </option>
  ))}
</select>
    </div>

    <div>
      <label className="text-sm font-medium">Número de vuelo</label>
      <input
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].flightNumber = e.target.value.toUpperCase()
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">Ciudad de origen</label>
      <input
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].origin = e.target.value
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">Ciudad de destino</label>
      <input
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].destination = e.target.value
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">Fecha del vuelo</label>
      <input
        type="date"
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].date = e.target.value
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">PNR del segmento</label>
      <input
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].bookingCode = e.target.value.toUpperCase()
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">Hora de salida</label>
      <input
        type="time"
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].departureTime = e.target.value
          setFlights(updated)
        }}
      />
    </div>

    <div>
      <label className="text-sm font-medium">Hora de llegada</label>
      <input
        type="time"
        className="w-full border p-2 rounded"
        onChange={e => {
          const updated = [...flights]
          updated[index].arrivalTime = e.target.value
          setFlights(updated)
        }}
      />
    </div>

  </div>

  {flights.length > 1 && (
    <button
      type="button"
      onClick={() => removeFlight(index)}
      className="text-red-500 text-sm"
    >
      Eliminar segmento
    </button>
  )}

</div>
      ))}

      <button
        type="button"
        onClick={addFlight}
        className="bg-gray-200 p-2 rounded"
      >
        ➕ Agregar segmento
      </button>

<h2 className="text-xl font-bold mt-6">Equipaje</h2>

<div className="flex flex-col gap-2">

  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={baggage.personalItem}
      onChange={e =>
        setBaggage({ ...baggage, personalItem: e.target.checked })
      }
    />
    Artículo personal
  </label>

  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={baggage.cabin10kg}
      onChange={e =>
        setBaggage({ ...baggage, cabin10kg: e.target.checked })
      }
    />
    Equipaje de cabina (10kg)
  </label>

  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={baggage.checked23kg}
      onChange={e =>
        setBaggage({ ...baggage, checked23kg: e.target.checked })
      }
    />
    Equipaje de bodega (23kg)
  </label>

</div>


      <button
  type="submit"
  disabled={isGenerating}
  className={`flex items-center justify-center gap-2 p-3 mt-4 text-white rounded transition ${
    isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800'
  }`}
>
  {isGenerating && (
    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
  )}

  {isGenerating ? 'Generando PDF...' : 'Crear Itinerario'}
</button>

{successMessage && (
  <div className="mt-3 text-sm font-medium">
    {successMessage}
  </div>
)}
    </form>
  )
}
