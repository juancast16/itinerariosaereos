export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'
import { enrichFlightsWithArrivalDay } from '@/lib/flight-arrival'
import { launchPdfBrowser } from '@/lib/pdf-browser'

export async function POST(req: Request) {
  let browser: Awaited<ReturnType<typeof launchPdfBrowser>> | null = null

  try {
    const itinerary: Itinerary = await req.json()
    const normalizedItinerary: Itinerary = {
      ...itinerary,
      flights: enrichFlightsWithArrivalDay(itinerary.flights || []),
    }

    browser = await launchPdfBrowser()
    const page = await browser.newPage()

    const html = renderPdfTemplate(normalizedItinerary)
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
    })

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="itinerario.pdf"',
      },
    })
  } catch (error) {
    console.error('Error /api/pdf:', error)
    return NextResponse.json(
      {
        error: 'Error generando PDF',
        detail:
          process.env.NODE_ENV !== 'production'
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
