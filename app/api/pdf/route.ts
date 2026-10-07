export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'
import { enrichFlightsWithArrivalDay } from '@/lib/flight-arrival'
import { launchPdfBrowser } from '@/lib/pdf-browser'

const MAX_LOGO_DATA_URL_CHARS = 350_000 // ~250KB image after base64

function sanitizeBranding(itinerary: Itinerary): Itinerary {
  const branding = itinerary.branding
  if (!branding?.customAgency) {
    return {
      ...itinerary,
      branding: branding ? { ...branding, customAgency: false } : { customAgency: false },
    }
  }

  const logo = (branding.logoDataUrl || '').trim()
  const logoOk =
    logo.startsWith('data:image/') && logo.length <= MAX_LOGO_DATA_URL_CHARS

  return {
    ...itinerary,
    branding: {
      customAgency: true,
      agencyName: (branding.agencyName || '').trim().slice(0, 120),
      logoDataUrl: logoOk ? logo : undefined,
    },
  }
}

export async function POST(req: Request) {
  let browser: Awaited<ReturnType<typeof launchPdfBrowser>> | null = null

  try {
    const itinerary: Itinerary = sanitizeBranding(await req.json())
    const normalizedItinerary: Itinerary = {
      ...itinerary,
      flights: enrichFlightsWithArrivalDay(itinerary.flights || []),
    }

    browser = await launchPdfBrowser()
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(60_000)
    page.setDefaultTimeout(60_000)

    const html = renderPdfTemplate(normalizedItinerary)
    // HTML es autosuficiente (data URLs); networkidle0 puede colgarse en Render.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60_000 })

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
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
