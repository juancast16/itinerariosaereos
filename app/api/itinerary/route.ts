// src/app/api/itinerary/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'
import { enrichFlightsWithArrivalDay } from '@/lib/flight-arrival'

import { runOCR } from '@/lib/ocr'
import { parseItinerary } from '@/lib/parser'

import { launchPdfBrowser } from '@/lib/pdf-browser'

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
    const normalizedItinerary: Itinerary = {
      ...itinerary,
      flights: enrichFlightsWithArrivalDay(itinerary.flights || [])
    }

    // 3) TEMPLATE
    const html = renderPdfTemplate(normalizedItinerary)

    // 4️⃣ PUPPETEER
    const browser = await launchPdfBrowser()
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    })

    await browser.close()

    return new NextResponse(Buffer.from(pdfBuffer), {
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
