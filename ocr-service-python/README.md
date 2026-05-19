# OCR en Python (EasyOCR)

Reemplazo recomendado del `ocr-service` en Node (Tesseract.js), que suele fallar en **pantallazos** de apps de aerolíneas.

Misma API: `POST /ocr` con campo `image` → `{ "text": "..." }`.

## Requisitos

- Python 3.10 o superior
- ~1–2 GB de espacio (modelos EasyOCR la primera vez)

## Instalación (Windows)

```powershell
cd ocr-service-python
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Servicio en `http://localhost:4001`.

La **primera ejecución** descarga modelos; puede tardar varios minutos.

## Uso con la app Next.js

Con el OCR Python corriendo, en otra terminal:

```powershell
cd ..
npm run dev
```

Opcional en `.env.local`:

```
OCR_SERVICE_URL=http://localhost:4001/ocr
```

## Variables de entorno

| Variable     | Default   | Descripción                          |
|-------------|-----------|--------------------------------------|
| `PORT`      | `4001`    | Puerto HTTP                          |
| `OCR_LANGS` | `es,en`   | Idiomas EasyOCR (coma separada)      |
| `OCR_USE_GPU` | vacío   | `true` si tienes CUDA                |

## Docker (opcional)

```bash
docker build -t voucher-ocr .
docker run -p 4001:4001 voucher-ocr
```

## Notas

- **CPU**: 3–15 s por imagen según tamaño (normal en pantallazos).
- **GPU**: mucho más rápido con `OCR_USE_GPU=true` y drivers NVIDIA.
- El parser sigue en Next (`lib/parser.ts`); este servicio solo devuelve texto.
