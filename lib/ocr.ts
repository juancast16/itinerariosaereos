// src/lib/ocr.ts

export async function runOCR(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('image', file)

  const res = await fetch('http://localhost:4001/ocr', {
    method: 'POST',
    body: formData
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OCR service failed: ${errorText}`)
  }

  const data = await res.json()

  console.log('===== OCR TEXT =====')
  console.log(data.text)
  console.log('====================')

  return data.text
}
