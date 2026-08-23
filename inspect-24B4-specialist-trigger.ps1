$ErrorActionPreference = "Stop"

$chatFile = Join-Path (Get-Location) "api\cda-chat.js"
$outFile = Join-Path (Get-Location) "cda-specialist-trigger-map.txt"

if (-not (Test-Path $chatFile)) {
  throw "api\cda-chat.js blev ikke fundet. Kør scriptet fra C:\Users\howan\cda-engine."
}

$lines = Get-Content -Path $chatFile
$patterns = @(
  "specialist",
  "Specialist",
  "specialister",
  "specialisterne",
  "specialistpanel",
  "SpecialistPanel",
  "panel",
  "AI-specialist",
  "ai-specialist",
  "hvad siger",
  "ekspert",
  "fagperson"
)

$matches = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
  foreach ($pattern in $patterns) {
    if ($lines[$i] -like "*$pattern*") {
      $matches += [PSCustomObject]@{
        Line = $i + 1
        Pattern = $pattern
        Text = $lines[$i]
      }
      break
    }
  }
}

$output = New-Object System.Collections.Generic.List[string]
$output.Add("CDA Engine 24B.4A - specialist trigger inspection")
$output.Add("READ ONLY: Scriptet ændrer ingen filer.")
$output.Add("File: api\cda-chat.js")
$output.Add("Matches: $($matches.Count)")
$output.Add("")

if ($matches.Count -eq 0) {
  $output.Add("Ingen specialist-relaterede linjer fundet med de søgte ord.")
} else {
  $seenBlocks = @{}
  foreach ($match in $matches) {
    $start = [Math]::Max(1, $match.Line - 5)
    $end = [Math]::Min($lines.Count, $match.Line + 8)
    $key = "$start-$end"
    if ($seenBlocks.ContainsKey($key)) { continue }
    $seenBlocks[$key] = $true

    $output.Add("--- context lines $start-$end ---")
    for ($lineNo = $start; $lineNo -le $end; $lineNo++) {
      $prefix = if ($lineNo -eq $match.Line) { ">>>" } else { "   " }
      $output.Add(("{0} {1,5}: {2}" -f $prefix, $lineNo, $lines[$lineNo - 1]))
    }
    $output.Add("")
  }
}

Set-Content -Path $outFile -Value $output -Encoding utf8
Write-Host "24B.4A færdig. Ingen filer ændret."
Write-Host "Resultat skrevet til: cda-specialist-trigger-map.txt"
Write-Host "Kør: Get-Content .\cda-specialist-trigger-map.txt"
