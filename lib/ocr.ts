// OCR: servicio externo (EasyOCR Python) o Tesseract embebido (plan Free Render).

import Tesseract from 'tesseract.js'

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL?.trim() || ''
const OCR_ENGINE = (process.env.OCR_ENGINE || '').trim().toLowerCase()
const TESSERACT_LANGS = process.env.OCR_TESSERACT_LANGS?.trim() || 'spa+eng'

function useEmbeddedTesseract() {
  if (OCR_ENGINE === 'tesseract' || OCR_ENGINE === 'local') return true
  // Sin URL configurada → Tesseract en el mismo servicio Next (Render Free)
  if (!OCR_SERVICE_URL) return true
  return false
}

async function runTesseractOCR(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await Tesseract.recognize(buffer, TESSERACT_LANGS)
  return (result.data.text || '').trim()
}

async function runRemoteOCR(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('image', file)

  let res: Response
  try {
    res = await fetch(OCR_SERVICE_URL, {
      method: 'POST',
      body: formData,
    })
  } catch {
    throw new Error(
      `No se pudo conectar al servicio OCR (${OCR_SERVICE_URL}). ` +
        'En Render Free usa OCR_ENGINE=tesseract sin OCR_SERVICE_URL, ' +
        'o inicia ocr-service-python en local.'
    )
  }

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OCR service failed: ${errorText}`)
  }

  const data = await res.json()
  return data.text || ''
}

export async function runOCR(file: File): Promise<string> {
  if (useEmbeddedTesseract()) {
    return runTesseractOCR(file)
  }

  try {
    return await runRemoteOCR(file)
  } catch (err) {
    // Si el servicio Python falla (OOM, dormido), intentar Tesseract como respaldo
    if (OCR_ENGINE !== 'remote-only') {
      console.warn('OCR remoto falló, usando Tesseract embebido:', err)
      return runTesseractOCR(file)
    }
    throw err
  }
}
