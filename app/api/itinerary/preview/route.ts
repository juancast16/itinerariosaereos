// src/app/api/itinerary/preview/route.ts

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { runOCR } from '@/lib/ocr'
import { parseItinerary } from '@/lib/parser'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const images = formData.getAll('images') as File[]

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'No se enviaron imágenes' },
        { status: 400 }
      )
    }

    const ocrTexts: string[] = []

    for (const image of images) {
      const text = await runOCR(image)
      ocrTexts.push(text)
    }

    const itinerary = parseItinerary(ocrTexts)

    return NextResponse.json(itinerary)
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Error generando preview' },
      { status: 500 }
    )
  }
}
