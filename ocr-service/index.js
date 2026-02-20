import express from 'express'
import multer from 'multer'
import Tesseract from 'tesseract.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.post('/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

    const result = await Tesseract.recognize(
      req.file.buffer,
      'spa'
    )

    res.json({ text: result.data.text })
  } catch (err) {
    console.error('OCR ERROR:', err)
    res.status(500).json({ error: 'OCR failed' })
  }
})

app.listen(4001, () => {
  console.log('🧠 OCR service running on http://localhost:4001')
})
