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
| `OCR_LANGS` | `es`      | Idiomas EasyOCR (`es` solo ahorra RAM) |
| `OCR_PRELOAD` | vacío   | `1` precarga al arrancar (local); en Render dejar vacío |
| `OCR_USE_GPU` | vacío   | `true` si tienes CUDA                |

## Render.com

EasyOCR **no cabe** en el plan free (512 MB). El servicio OCR debe usar:

- **Instance type:** al menos **1 GB RAM** (recomendado **2 GB**)
- **Root Directory:** `ocr-service-python`
- **Runtime:** Docker
- **Variables:** `OCR_LANGS=es` (sin `OCR_PRELOAD`)

La app Next.js va en **otro** Web Service (Node, raíz del repo, rama `main`), con:

`OCR_SERVICE_URL=https://tu-ocr.onrender.com/ocr`

## Docker (opcional)

```bash
docker build -t voucher-ocr .
docker run -p 4001:4001 voucher-ocr
```

## Notas

- **CPU**: 3–15 s por imagen según tamaño (normal en pantallazos).
- **GPU**: mucho más rápido con `OCR_USE_GPU=true` y drivers NVIDIA.
- El parser sigue en Next (`lib/parser.ts`); este servicio solo devuelve texto.
