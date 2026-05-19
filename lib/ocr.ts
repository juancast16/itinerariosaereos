// src/lib/ocr.ts

const OCR_SERVICE_URL =
  process.env.OCR_SERVICE_URL?.trim() || 'http://localhost:4001/ocr'

export async function runOCR(file: File): Promise<string> {
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
        'Inicia el OCR Python (ocr-service-python: python main.py) o el servicio Node legacy, ' +
        'o configura OCR_SERVICE_URL.'
    )
  }

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OCR service failed: ${errorText}`)
  }

  const data = await res.json()
  return data.text || ''
}
