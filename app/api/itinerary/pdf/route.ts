// src/app/api/itinerary/pdf/route.ts

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { generatePdf } from '@/lib/pdf'
import { Itinerary } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const itinerary = (await req.json()) as Itinerary

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
      { error: 'Error generando PDF' },
      { status: 500 }
    )
  }
}
