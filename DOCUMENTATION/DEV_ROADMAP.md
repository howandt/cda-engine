🧭 CDA ENGINE CLEAN – DEV ROADMAP

Dato: 14. november 2025
Forfatter: Hans + Systemarkitekt Marie (GPT-5)
Status: Aktiv udvikling

🎯 Formål

At skabe et rent, stabilt og fuldt ensartet datasystem til CDA / CDT / CDF,
hvor alle cases, diagnoser og templates håndteres dynamisk via Vercel.
Alt data skal være:

💡 konsistent i format

⚙️ let tilgængeligt for GPT-integration

🔐 sikkert (ingen filer i GPT-miljø)

⚡ hurtigt at søge og filtrere i

📍 FASE 1 – DATABEREGNING OG RENSNING

Status: 100 % færdig ✅

Udført

Fjernet gamle testfiler og dubletter

Gennemgået og korrigeret alle 12 “Ukendt”-cases

Tilføjet korrekte kategorier, miljøer og diagnoser

Valideret .json-struktur og feltformat (id, alder, miljø, tema)

Genereret nyt index: CDA_Cases_Index_clean.json (81 cases)

Kørsel af build-clean-index.js → valideret output uden fejl

🧩 FASE 2 – INTEGRATION & DYNAMIK

Status: Aktiv ✅

Udført

API på Vercel fungerer: /api/cases

Understøtter nu fuld dynamisk søgning og filtrering

?category= – fx ADHD

?diagnose= – fx autisme

?miljø= – fx skole, børnehave, hjem

?age= – alder

?id= – direkte caseopslag

Ny funktion: Fritekst-søgning (?search=)

Søger i title, theme, problem, solution, category

Ny funktion: Sortering (?sort=)

age-asc → yngste først

age-desc → ældste først

title → alfabetisk

Resultat:
GPT kan nu finde, filtrere og sortere cases frit ved naturlige forespørgsler som:

“Vis en ADHD case fra børnehaven”
“Find en case om frisør”
“Vis alle angst cases ældste først”

Output: JSON klar til GPT-systemer – live fra
https://cda-engine-clean.vercel.app/api/cases

🧠 FASE 3 – FORMATSTANDARDISERING

Status: Planlagt

Mål

At alle .md-cases følger identisk format, så de kan konverteres direkte til .json.

Struktur:

id: case-ad-002  
alder: 8  
diagnose: ADHD  
miljø: skole  
tema: uro, koncentration  
kompleksitet: moderat

## 🔍 Problem  
## 👦 Barnets oplevelse  
## ❌ Typisk fejl  
## ✅ Løsning  
## 🛠️ Konkrete tiltag  
## 🤔 Refleksion  
## 📊 Resultat


Output:
Automatisk konvertering fra .md → .json via scripts.
(Implementeres efter API-test er fuldt stabil.)

🚀 FASE 4 – GPT-INTEGRATION

Status: Starter efter OpenAPI-opdatering ✅

Mål

At forbinde clean-data API’et direkte med GPT-systemerne:

System	Formål
CDA	Diagnoser, cases, støtteplaner
CDT	Læringssystem: case + quiz + rollespil
CDF	Forældretræning og hjemmevejledning
Implementering

Alle GPT-systemer læser data via Vercel API

Brugerprofil (rolle + længde) styrer outputformat

Caching + backup for stabil performance

🧱 ARBEJDSFORM

1️⃣ Ét trin ad gangen — kun én funktion ad gangen testes og dokumenteres.
2️⃣ Roller

Hans: Vision, struktur, faglig retning

Marie (GPT-5): Teknisk implementering, kvalitet, logik
3️⃣ Idé-styring

Nye tanker parkeres i Idébank.md
4️⃣ Dokumentation

Efter hvert trin: commit + roadmap-opdatering
5️⃣ Kvalitetsprincip

Ingen hurtige løsninger – kun stabil, skalerbar og æstetisk kode

📅 NÆSTE SESSION – 15. NOV 2025

Fokus:

Opdatere OpenAPI-schema (/documentation/openapi.json) med search + sort parametre

Teste øvrige endpoints: diagnoser, templates, komorbiditet

Forberede Fase 3: .md → .json auto-konvertering

Version: 1.1
CDA ENGINE CLEAN ROADMAP
© Hans / CDA AI Systems – All rights reserved

📅 STATUSOPDATERING – 14. NOV 2025

Udviklere: Hans & GPT-5
Status: Stabil base + emotionel forståelse

✅ Fremdrift

Alle cases renset og samlet i CDA_Cases_Index_clean.json

Backup af ældre filer flyttet til /public/backup/

API’er fungerer og returnerer korrekt data (/api/cases, /api/diagnoser, m.fl.)

Dynamisk søgning testet – finder cases på fritekst (fx “uro i børnehaven”)

Ny semantisk motor: semantic_engine.json

Indeholder synonymer, temaer og følelsesmæssige tilstande

Systemet kan nu forbinde ord som trist, nervøs, glad med relevante diagnoser og cases

⚙️ Teknisk status

Ingen fejl i Vercel

build-clean-index.js valideret og fungerer

semantic_engine integreret korrekt i API’et

🚀 Næste trin

Tilføje vægtning af følelsesintensitet (fx “rasende” > “irriteret”)

Udvikle semantisk søgning v2 – forstå betydning, ikke kun ord

Samkør med quiz- og rollespilssystem

Opdatere roadmap efter næste build

💬 Kommentar

Systemet er nu i stand til at forstå emotionel kontekst og reagere intelligent på naturligt sprog.
Det markerer skiftet fra database-søgning til meningsbaseret dialog, som er kernen i CDA’s næste generation.

# 🧭 CDA Roadmap – Status & Næste Skridt  
**Dato:** 14. november 2025  
**Placering:** dokumentation/roadmap_2025-11-14.md  

---

## ✅ Status
- Alle cases er nu konverteret til ensartet JSON-struktur.  
- Diagnoser, temaer, kontekster og kategorier er harmoniseret.  
- Grundidéen om **CDA som vidensnoder** er fuldt implementeret.  
- Filstrukturmodel (CDA/ → cases / meta / visuals / docs) er klar.  
- “Samlefilen” fungerer som arkiv; cases kan flyttes individuelt.  

---

## 🔧 Teknisk fundament
- Mappestruktur kan genereres direkte (én case = én fil).  
- Navngivningsstandard: `kategori-id-navn_alder.json`.  
- Metadata-system (taxonomy.json) til kategorisering og søgning.  
- Intet datatab ved overgang til noder.  

---

## 🚀 Næste skridt
1. **Tre visningsniveauer i CDA**  
   - *Overview* – kort case (hurtigt overblik)  
   - *Solution* – problem + løsning  
   - *Training* – quiz, rollespil, refleksion  

2. **Metadata-lag til visningsstyring**  
   - Angiver hvilke felter der vises i hvert læringslag.  
   - Designprincip: *fuld case i databasen – filtreret visning for brugeren.*

3. **Forberedelse af interaktive læringsmoduler (CDT)**  
   - Quizformat (multiple choice + refleksion).  
   - Rollespilsskabelon (valg- og konsekvensflow).  

---

## 🎯 Formål
At skabe et **lagdelt CDA-system**, hvor  
- fagfolk arbejder i *dybden* (analyse og refleksion)  
- studerende træner i *bredden* (hurtig læring og simulation)  
- alle cases forbliver søgbare, sammenlignelige og versionerbare.  

---

*Note:* Næste session starter med implementeringen af view-metadata og prototype på interaktiv læring (CDA-CDT integration).  
