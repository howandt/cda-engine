$ErrorActionPreference = "Stop"

$chatFile = Join-Path (Get-Location) "api\cda-chat.js"
$engineFile = Join-Path (Get-Location) "lib\specialistEngine.js"
$anchor = 'import { routeBornehaveInput } from "../lib/bornehaveRouter.js";'
$importLine = 'import { specialistEngineHealthcheck } from "../lib/specialistEngine.js";'

if (-not (Test-Path $chatFile)) {
  throw "api\cda-chat.js blev ikke fundet. Kør scriptet fra C:\Users\howan\cda-engine."
}

if (-not (Test-Path $engineFile)) {
  throw "lib\specialistEngine.js blev ikke fundet. 24B.2 skal være lagt ind først."
}

$content = Get-Content -Raw -Path $chatFile

if ($content.Contains($importLine)) {
  Write-Host "24B.3 importlinje findes allerede. Ingen ændring lavet."
  exit 0
}

if (-not $content.Contains($anchor)) {
  throw "Kunne ikke finde sikker import-anchor i api\cda-chat.js. Ingen ændring lavet."
}

$content = $content.Replace($anchor, $anchor + "`r`n" + $importLine)
Set-Content -Path $chatFile -Value $content -Encoding utf8

Write-Host "24B.3 import-test indsat: api\cda-chat.js importerer nu lib\specialistEngine.js."
Write-Host "Kør: git diff -- api/cda-chat.js"
