# Arranca el servicio OCR (EasyOCR) en http://localhost:4001
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    Write-Host "Creando entorno virtual..."
    python -m venv .venv
}

Write-Host "Instalando dependencias (solo la primera vez tarda varios minutos)..."
.\.venv\Scripts\pip.exe install -r requirements.txt -q

Write-Host ""
Write-Host "Iniciando OCR en http://localhost:4001"
Write-Host "Deja esta ventana abierta. En otra terminal: npm run dev"
Write-Host ""
.\.venv\Scripts\python.exe main.py
