export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'
import { enrichFlightsWithArrivalDay } from '@/lib/flight-arrival'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function POST(req: Request) {

  const itinerary: Itinerary = await req.json()
  const normalizedItinerary: Itinerary = {
    ...itinerary,
    flights: enrichFlightsWithArrivalDay(itinerary.flights || [])
  }

  const browser = await puppeteer.launch({
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--no-zygote'
  ],
  executablePath: await chromium.executablePath(),
  headless: true
})

  const page = await browser.newPage()

  const html = renderPdfTemplate(normalizedItinerary)

  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true
  })

  await browser.close()

  return new NextResponse(Buffer.from(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="itinerario.pdf"'
    }
  })
}
