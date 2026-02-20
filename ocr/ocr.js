import fs from 'fs'
import Tesseract from 'tesseract.js'

async function run() {
  const base64 = fs.readFileSync('./ocr/image.txt', 'utf8')

  if (!base64) {
    console.error('No base64 image provided')
    process.exit(1)
  }

  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(cleanBase64, 'base64')

  const result = await Tesseract.recognize(buffer, 'eng')

  console.log(result.data.text)
}

run()