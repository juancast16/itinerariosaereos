export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Itinerary } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const body: Itinerary = await req.json()

    // Aquí podrías validar estructura si quieres
    return NextResponse.json(body)

  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Error creando itinerario' },
      { status: 500 }
    )
  }
}
