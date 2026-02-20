import { NextResponse } from 'next/server'
import Tesseract from 'tesseract.js'

export async function POST(req: Request) {
  const body = await req.json()
  const base64Image = body.image

  if (!base64Image) {
    return NextResponse.json(
      { error: 'No image base64 provided' },
      { status: 400 }
    )
  }

  // Limpia el encabezado base64
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const result = await Tesseract.recognize(buffer, 'eng')

  return NextResponse.json({
    text: result.data.text
  })
}
