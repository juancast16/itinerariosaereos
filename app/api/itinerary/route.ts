// src/app/api/itinerary/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { renderPdfTemplate } from '@/app/voucher/pdf/template'
import { Itinerary } from '@/lib/types'

import { runOCR } from '@/lib/ocr'
import { parseItinerary } from '@/lib/parser'

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

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

    // 3️⃣ TEMPLATE
    const html = renderPdfTemplate(itinerary)

    // 4️⃣ PUPPETEER
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })

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