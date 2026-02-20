'use client'

import { useState } from 'react'
import { Itinerary } from '@/lib/types'

export default function ItineraryPage() {
  const [files, setFiles] = useState<File[]>([])
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(false)

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    setFiles(Array.from(e.target.files))
  }

  async function handlePreview() {
    if (files.length === 0) {
      alert('Selecciona al menos una imagen')
      return
    }

    setLoading(true)
    setItinerary(null)

    const formData = new FormData()
    files.forEach(file => formData.append('images', file))

    const res = await fetch('/api/itinerary/preview', {
      method: 'POST',
      body: formData
    })

    if (!res.ok) {
      alert('Error generando preview')
      setLoading(false)
      return
    }

    const data = await res.json()
    setItinerary(data)
    setLoading(false)
  }

  async function handleGeneratePdf() {
    if (!itinerary) return

    setLoading(true)

    const res = await fetch('/api/itinerary/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itinerary)
    })

    if (!res.ok) {
      alert('Error generando PDF')
      setLoading(false)
      return
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = 'itinerario.pdf'
    a.click()

    window.URL.revokeObjectURL(url)
    setLoading(false)
  }

  return (
    <div style={{ padding: 30, maxWidth: 900 }}>
      <h1>Generar Itinerario</h1>

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={onFilesChange}
      />

      <div style={{ marginTop: 20 }}>
        <button onClick={handlePreview} disabled={loading}>
          {loading ? 'Procesando...' : 'Ver Preview'}
        </button>
      </div>

      {itinerary && (
        <>
          <h2 style={{ marginTop: 30 }}>Preview (JSON)</h2>

          <pre
            style={{
              background: '#111',
              color: '#0f0',
              padding: 15,
              maxHeight: 400,
              overflow: 'auto'
            }}
          >
            {JSON.stringify(itinerary, null, 2)}
          </pre>

          <button
            onClick={handleGeneratePdf}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            Generar PDF
          </button>
        </>
      )}
    </div>
  )
}
