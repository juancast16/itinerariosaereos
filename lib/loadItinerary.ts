import * as fs from 'fs'
import path from 'path'
import { Itinerary } from '@/lib/types'

export function loadSampleItinerary(): Itinerary {
  const filePath = path.join(
    process.cwd(),
    'src',
    'data',
    'sample-itinerary.json'
  )

  const raw = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)

  return data as Itinerary
}
