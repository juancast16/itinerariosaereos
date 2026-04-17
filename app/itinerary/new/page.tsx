'use client'

import { useEffect, useRef, useState } from 'react'

const AIRLINES = [
  'Avianca',
  'Iberia',
  'LATAM',
  'Air Europa',
  'Copa Airlines',
  'Wingo',
  'Jetsmart',
  'Wizz',
  'Word2fly',
]

type PassengerForm = {
  fullName: string
}

type FlightForm = {
  airline: string
  flightNumber: string
  bookingCode: string
  origin: string
  destination: string
  date: string
  departureTime: string
  arrivalTime: string
}

type ParsedItinerary = {
  passengers?: { fullName: string }[]
  flights?: {
    airline?: string
    flightNumber?: string
    bookingCode?: string
    origin?: string
    destination?: string
    date?: string
    departureTime?: string
    arrivalTime?: string
  }[]
  baggage?: {
    personalItem?: boolean
    cabin10kg?: boolean
    checked23kg?: boolean
  }
}

function emptyFlight(): FlightForm {
  return {
    airline: '',
    flightNumber: '',
    bookingCode: '',
    origin: '',
    destination: '',
    date: '',
    departureTime: '',
    arrivalTime: '',
  }
}

function toDateInput(value?: string) {
  if (!value) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''

  const day = match[1]
  const month = match[2]
  const year = match[3]
  return `${year}-${month}-${day}`
}

function toTimeInput(value?: string) {
  if (!value) return ''
  const match = value.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : ''
}

export default function NewItinerary() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [passengers, setPassengers] = useState<PassengerForm[]>([{ fullName: '' }])
  const [airline, setAirline] = useState('')
  const [flights, setFlights] = useState<FlightForm[]>([emptyFlight()])

  const [baggage, setBaggage] = useState({
    personalItem: true,
    cabin10kg: true,
    checked23kg: false,
  })

  const [isGenerating, setIsGenerating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([])
  const [isParsingScreenshots, setIsParsingScreenshots] = useState(false)
  const [parseMessage, setParseMessage] = useState('')

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!e.clipboardData) return

      const images: File[] = []
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file && file.type.startsWith('image/')) {
            images.push(file)
          }
        }
      }

      if (images.length === 0) return
      e.preventDefault()
      addScreenshotFiles(images, { replace: true })
      setParseMessage(
        `Se pegaron ${images.length} imagen(es) y se reemplazo la carga anterior. Ahora pulsa \"Procesar pantallazos\".`
      )
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  function addScreenshotFiles(newFiles: File[], options?: { replace?: boolean }) {
    const replace = options?.replace ?? true

    const deduped: File[] = []
    for (const file of newFiles) {
      const exists = deduped.some(
        f =>
          f.name === file.name &&
          f.size === file.size &&
          f.lastModified === file.lastModified
      )
      if (!exists) deduped.push(file)
    }

    if (replace) {
      setScreenshotFiles(deduped)
      return
    }

    setScreenshotFiles(prev => [...prev, ...deduped])
  }

  function onScreenshotsSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'))
    addScreenshotFiles(files, { replace: true })
    setParseMessage(
      `Se seleccionaron ${files.length} imagen(es) y se reemplazo la carga anterior. Ahora pulsa \"Procesar pantallazos\".`
    )

    if (e.target.value) {
      e.target.value = ''
    }
  }

  async function processScreenshots() {
    if (screenshotFiles.length === 0) {
      setParseMessage('Primero pega imagenes con Ctrl+V o selecciona archivos.')
      return
    }

    setIsParsingScreenshots(true)
    setParseMessage('Procesando pantallazos con OCR...')

    try {
      const formData = new FormData()
      screenshotFiles.forEach(file => formData.append('images', file))

      const res = await fetch('/api/itinerary/preview', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        let backendMessage = 'No se pudo procesar OCR'
        try {
          const errorBody = await res.json()
          backendMessage = errorBody?.detail || errorBody?.error || backendMessage
        } catch {
          // no-op: fallback al mensaje por defecto
        }
        throw new Error(backendMessage)
      }

      const parsed: ParsedItinerary = await res.json()

      const parsedPassengers =
        parsed.passengers && parsed.passengers.length > 0
          ? parsed.passengers.map(p => ({ fullName: p.fullName || '' }))
          : [{ fullName: '' }]

      const parsedFlights =
        parsed.flights && parsed.flights.length > 0
          ? parsed.flights.map(f => ({
              airline: f.airline || '',
              flightNumber: (f.flightNumber || '').toUpperCase(),
              bookingCode: (f.bookingCode || '').toUpperCase(),
              origin: f.origin || '',
              destination: f.destination || '',
              date: toDateInput(f.date),
              departureTime: toTimeInput(f.departureTime),
              arrivalTime: toTimeInput(f.arrivalTime),
            }))
          : [emptyFlight()]

      setPassengers(parsedPassengers)
      setFlights(parsedFlights)

      if (parsedFlights[0]?.airline) {
        setAirline(parsedFlights[0].airline)
      }

      if (parsed.baggage) {
        setBaggage({
          personalItem: parsed.baggage.personalItem ?? true,
          cabin10kg: parsed.baggage.cabin10kg ?? true,
          checked23kg: parsed.baggage.checked23kg ?? false,
        })
      }

      const hasPassengerData = parsedPassengers.some(p => p.fullName.trim().length > 0)
      const hasFlightData = parsedFlights.some(
        f =>
          f.origin.trim().length > 0 ||
          f.destination.trim().length > 0 ||
          f.flightNumber.trim().length > 0
      )

      if (!hasPassengerData && !hasFlightData) {
        setParseMessage(
          'OCR ejecutado, pero no se detectaron datos utiles del vuelo. Prueba otro pantallazo mas completo.'
        )
      } else {
        setParseMessage('OCR aplicado. Revisa y corrige campos antes de generar el PDF.')
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Hubo un error al leer los pantallazos.'
      setParseMessage(`Error OCR: ${message}`)
    } finally {
      setIsParsingScreenshots(false)
    }
  }

  function addFlight() {
    setFlights([...flights, emptyFlight()])
  }

  function removeFlight(index: number) {
    const updated = flights.filter((_, i) => i !== index)
    setFlights(updated)
  }

  function addPassenger() {
    setPassengers([...passengers, { fullName: '' }])
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
      passengers,
      bookingCodes: Array.from(
        new Map(
          flights
            .filter(f => f.bookingCode)
            .map(f => [f.bookingCode, { airline: f.airline || airline, code: f.bookingCode }])
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
        arrivalTime: flight.arrivalTime,
      })),
      baggage,
    }

    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itineraryData),
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

      setSuccessMessage('PDF generado correctamente')
    } catch {
      setSuccessMessage('Hubo un error generando el PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 max-w-xl">
      <h2 className="text-xl font-bold">Carga rapida con pantallazos</h2>

      <div
        className="border-2 border-dashed border-gray-300 rounded p-4 bg-gray-50 cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-sm font-medium">Pega con Ctrl+V o haz clic para seleccionar imagenes</p>
        <p className="text-xs text-gray-600 mt-1">
          Puedes pegar varios pantallazos del itinerario y autollenar este formulario con OCR.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onScreenshotsSelected}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={processScreenshots}
          disabled={isParsingScreenshots || screenshotFiles.length === 0}
          className={`p-2 rounded text-white ${
            isParsingScreenshots || screenshotFiles.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isParsingScreenshots ? 'Procesando OCR...' : 'Procesar pantallazos'}
        </button>

        <button
          type="button"
          onClick={() => {
            setScreenshotFiles([])
            setParseMessage('')
          }}
          className="p-2 rounded bg-gray-200"
        >
          Limpiar imagenes
        </button>
      </div>

      {screenshotFiles.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">Imagenes cargadas: {screenshotFiles.length}</p>
          <ul className="text-xs text-gray-600 list-disc pl-5 mt-1 max-h-24 overflow-auto">
            {screenshotFiles.map((file, idx) => (
              <li key={`${file.name}-${file.lastModified}-${idx}`}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}

      {parseMessage && <div className="text-sm font-medium text-blue-700">{parseMessage}</div>}

      <h2 className="text-xl font-bold mt-2">Pasajeros</h2>

      {passengers.map((p, index) => (
        <div key={index} className="flex gap-2 items-center">
          <input
            className="border p-2 rounded w-full"
            placeholder={`Nombre pasajero ${index + 1}`}
            value={p.fullName}
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

      <button type="button" onClick={addPassenger} className="bg-gray-200 p-2 rounded mt-2">
        + Agregar pasajero
      </button>

      <input
        placeholder="Aerolinea principal (opcional)"
        value={airline}
        onChange={e => setAirline(e.target.value)}
      />

      <h2 className="text-xl font-bold mt-6">Segmentos</h2>
      <p className="text-sm text-gray-600">
        Para vuelos con escala: agrega cada tramo como un segmento nuevo y conserva el mismo PNR. Para
        tramos separados (otro tiquete): usa un PNR distinto.
      </p>

      {flights.map((flight, index) => (
        <div key={index} className="border p-4 rounded space-y-4">
          <h3 className="font-semibold text-lg">Segmento {index + 1}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Aerolinea</label>
              <select
                className="w-full border p-2 rounded"
                value={flight.airline}
                onChange={e => {
                  const updated = [...flights]
                  updated[index].airline = e.target.value
                  setFlights(updated)
                }}
              >
                <option value="">Seleccionar aerolinea</option>
                {AIRLINES.map(a => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Numero de vuelo</label>
              <input
                className="w-full border p-2 rounded"
                value={flight.flightNumber}
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
                value={flight.origin}
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
                value={flight.destination}
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
                value={flight.date}
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
                value={flight.bookingCode}
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
                value={flight.departureTime}
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
                value={flight.arrivalTime}
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

      <button type="button" onClick={addFlight} className="bg-gray-200 p-2 rounded">
        + Agregar segmento
      </button>

      <h2 className="text-xl font-bold mt-6">Equipaje</h2>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={baggage.personalItem}
            onChange={e => setBaggage({ ...baggage, personalItem: e.target.checked })}
          />
          Articulo personal
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={baggage.cabin10kg}
            onChange={e => setBaggage({ ...baggage, cabin10kg: e.target.checked })}
          />
          Equipaje de cabina (10kg)
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={baggage.checked23kg}
            onChange={e => setBaggage({ ...baggage, checked23kg: e.target.checked })}
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

      {successMessage && <div className="mt-3 text-sm font-medium">{successMessage}</div>}
    </form>
  )
}
