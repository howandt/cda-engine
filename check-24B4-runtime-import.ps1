$ErrorActionPreference = "Continue"

Write-Host "CDA Engine 24B.4B - runtime/import check"
Write-Host "Denne test ændrer ingen filer og bruger ikke git."
Write-Host ""

if (-not (Test-Path ".\api\cda-chat.js")) {
  Write-Host "FEJL: api\cda-chat.js blev ikke fundet. Kør scriptet fra C:\Users\howan\cda-engine" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".\lib\specialistEngine.js")) {
  Write-Host "FEJL: lib\specialistEngine.js blev ikke fundet. Kør scriptet fra C:\Users\howan\cda-engine" -ForegroundColor Red
  exit 1
}

Write-Host "Node version:"
node --version
Write-Host ""

Write-Host "1) Syntax check: lib\specialistEngine.js"
node --check .\lib\specialistEngine.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "STOP: Syntaxfejl i lib\specialistEngine.js" -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host "OK: lib\specialistEngine.js kan parses"
Write-Host ""

Write-Host "2) Syntax check: api\cda-chat.js"
node --check .\api\cda-chat.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "STOP: Syntaxfejl i api\cda-chat.js" -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host "OK: api\cda-chat.js kan parses"
Write-Host ""

Write-Host "3) Runtime import: lib\specialistEngine.js"
node --input-type=module -e "import('./lib/specialistEngine.js').then((m)=>{ console.log('OK: lib import virker'); console.log(Object.keys(m).join(', ')); }).catch((e)=>{ console.error(e && e.stack ? e.stack : e); process.exit(1); })"
if ($LASTEXITCODE -ne 0) {
  Write-Host "STOP: Runtime/import-fejl i lib\specialistEngine.js" -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host ""

Write-Host "4) Runtime import: api\cda-chat.js"
$env:OPENAI_API_KEY = "diagnostic_dummy_key"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "diagnostic_dummy_key"
node --input-type=module -e "import('./api/cda-chat.js').then(()=>{ console.log('OK: api/cda-chat.js import virker'); }).catch((e)=>{ console.error(e && e.stack ? e.stack : e); process.exit(1); })"
if ($LASTEXITCODE -ne 0) {
  Write-Host "STOP: Runtime/import-fejl i api\cda-chat.js eller en fil den importerer" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "ALT OK LOKALT: Begge filer parser og importerer lokalt. Hvis Vercel stadig fejler, er det pushed version/deploy/runtime-log der skal sammenholdes." -ForegroundColor Green
