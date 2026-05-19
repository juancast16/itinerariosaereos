"""
Servicio OCR para pantallazos de itinerarios.
Usa EasyOCR (mejor que Tesseract.js en capturas de móvil / UI densa).

Misma API que ocr-service (Node):
  POST /ocr  campo multipart: image
  respuesta: { "text": "..." }
"""

from __future__ import annotations

import io
import os
from contextlib import asynccontextmanager

import cv2
import easyocr
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

PORT = int(os.environ.get("PORT", "4001"))
USE_GPU = os.environ.get("OCR_USE_GPU", "").lower() in ("1", "true", "yes")
LANGS = [s.strip() for s in os.environ.get("OCR_LANGS", "es,en").split(",") if s.strip()]

_reader: easyocr.Reader | None = None


def get_reader() -> easyocr.Reader:
    global _reader
    if _reader is None:
        print(f"Cargando EasyOCR (idiomas={LANGS}, gpu={USE_GPU})… primera vez puede tardar.")
        _reader = easyocr.Reader(LANGS, gpu=USE_GPU)
        print("EasyOCR listo.")
    return _reader


def preprocess(image_rgb: np.ndarray) -> np.ndarray:
    """Mejora lectura en pantallazos: escala, gris, contraste."""
    h, w = image_rgb.shape[:2]
    min_side = min(h, w)
    if min_side < 900:
        scale = 900 / min_side
        image_rgb = cv2.resize(
            image_rgb,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.bilateralFilter(gray, 5, 50, 50)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)


def run_ocr_on_bytes(data: bytes) -> str:
    pil = Image.open(io.BytesIO(data)).convert("RGB")
    rgb = np.array(pil)
    prepared = preprocess(rgb)

    reader = get_reader()
    # detail=0 → solo strings; paragraph agrupa líneas cercanas
    chunks = reader.readtext(prepared, detail=0, paragraph=True)
    lines = [str(line).strip() for line in chunks if str(line).strip()]
    return "\n".join(lines)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Precarga modelos al arrancar (evita timeout en la 1ª petición)
    try:
        get_reader()
    except Exception as exc:
        print(f"AVISO: no se pudo precargar EasyOCR: {exc}")
    yield


app = FastAPI(title="voucher-itinerary OCR", lifespan=lifespan)


@app.get("/health")
def health():
    return {"ok": True, "engine": "easyocr", "langs": LANGS, "gpu": USE_GPU}


@app.post("/ocr")
async def ocr(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        return JSONResponse({"error": "Se esperaba una imagen"}, status_code=400)

    data = await image.read()
    if not data:
        return JSONResponse({"error": "Imagen vacía"}, status_code=400)

    try:
        text = run_ocr_on_bytes(data)
        return {"text": text}
    except Exception as exc:
        print("OCR ERROR:", exc)
        return JSONResponse({"error": f"OCR failed: {exc}"}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
