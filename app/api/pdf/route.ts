// src/app/api/pdf/route.ts

import { NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  headless: true
})
import { Itinerary } from '@/lib/types'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'

export async function POST(req: Request) {
  const itinerary: Itinerary = await req.json()

  const page = await browser.newPage()


const html = renderPdfTemplate(itinerary)

  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true
  })

  await browser.close()

  return new NextResponse(pdfBuffer as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="itinerario.pdf"'
    }
  })
}
