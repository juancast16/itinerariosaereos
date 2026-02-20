// src/app/api/itinerary/route.ts

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'

// estas funciones ya las tienes o las moveremos luego
import { runOCR } from '@/lib/ocr'
import { parseItinerary } from '@/lib/parser'
import { generatePdf } from '@/lib/pdf'

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

    // 1️⃣ OCR
    const ocrTexts: string[] = []
    for (const image of images) {
      const text = await runOCR(image)
      ocrTexts.push(text)
    }

    // 2️⃣ PARSER
    const itinerary: Itinerary = parseItinerary(ocrTexts)

    // 3️⃣ PDF
    const html = renderPdfTemplate(itinerary)
    const pdfBuffer = await generatePdf(html)
    const pdfUint8 = new Uint8Array(pdfBuffer)

    return new NextResponse(pdfUint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="itinerario.pdf"',
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Error generando itinerario' },
      { status: 500 }
    )
  }
}
