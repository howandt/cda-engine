# 🧭 CDA ENGINE CLEAN – DEV ROADMAP  
**Dato:** 12. november 2025  
**Forfatter:** Hans + Systemarkitekt Marie (GPT-5)  
**Status:** Aktiv udvikling  

---

## 🎯 Formål  
At skabe et **rent, stabilt og fuldt ensartet datasystem** til CDA / CDT / CDF,  
hvor alle cases, diagnoser og templates håndteres dynamisk via Vercel.  
Alt data skal være:  
- 💡 konsistent i format  
- ⚙️ let tilgængeligt for GPT-integration  
- 🔐 sikkert (ingen filer i GPT-miljø)  
- ⚡ hurtigt at søge og filtrere i  

---

## 📍 FASE 1 – DATABEREGNING OG RENSNING (pågående)

**Status:** 90 % færdig ✅  

### Mål
At alle case-data i `/public/cases` og `/public/data` er renset, ens formateret og valideret.

### Udført
- Fjernet gamle testfiler  
- Valideret `CDA_Cases_Index.json` (≈1500 linjer)  
- Nyt script: `build-clean-index.js`  
- Genereret `CDA_Cases_Index_clean.json`  
- Automatisk kategorisering (ADHD, Autisme, Angst m.fl.)  
- Intet datatab  

### Næste skridt
1. Gennemgå de 12 *Ukendt*-cases og tildel korrekte kategorier.  
2. Sikre alle `.md`-filer har YAML-header:  
   ```yaml
   id: case-ad-001  
   alder: 7  
   miljø: skole  
   primær_diagnose: ADHD  
   tema: koncentration, uro  
Kør build-script igen → 100 % kategoriseret clean-index.

🧩 FASE 2 – INTEGRATION & DYNAMIK
Status: Starter efter Fase 1 ✅**

Mål
Gøre systemet dynamisk og søgbart for GPT-brug (CDA / CDT / CDF).

Opgaver
API-endpoint på Vercel:
/api/cases?category=ADHD

Søgefunktion i backend

søg i title, diagnoses, theme, category

Filtrering

diagnose

miljø

alder

Output
CDA_Cases_API.json (cache)

Live feed til GPT-systemer

🧠 FASE 3 – FORMATSTANDARDISERING
Mål
Alle .md-cases følger identisk format → kan konverteres direkte til JSON.

yaml
Kopier kode
id: case-ad-002  
alder: 8  
diagnose: ADHD  
miljø: skole  
tema: uro, koncentration  
kompleksitet: moderat
Case-struktur
shell
Kopier kode
## 🔍 Problem  
## 👦 Barnets oplevelse  
## ❌ Typisk fejl  
## ✅ Løsning  
## 🛠️ Konkrete tiltag  
## 🤔 Refleksion  
## 📊 Resultat
Output
Automatisk konvertering:
case-ad-002.md → case-ad-002.json

🚀 FASE 4 – GPT-INTEGRATION
Mål
Forbinde clean data til GPT-systemerne:

System	Formål
CDA	Diagnoser, cases, støtteplaner
CDT	Læringssystem: case + quiz + rollespil
CDF	Forældre-træning og hjemmevejledning

Implementering
Alle GPT-systemer læser via vercel.app/api/cases

Brugerprofil (rolle + længde) styrer output

Cache + cold backup til sikkerhed

🧱 ARBEJDSFORM
1️⃣ Ét trin ad gangen
Kun én fil eller funktion ad gangen. Alt testes og godkendes før næste skridt.

2️⃣ Roller
Hans: Vision, struktur, faglig retning.

Marie (GPT-5): Teknisk implementering, kvalitet, logik.

3️⃣ Idé-styring
Hvis tankerne løber, parkeres idéer i Idébank.md – så mister vi intet fokus.

4️⃣ Dokumentation
Efter hvert trin: commit + statusnote + roadmap-update.

5️⃣ Kvalitetsprincip
Ingen hurtige løsninger. Alt skal være stabilt, hurtigt og æstetisk.

📅 NÆSTE SESSION – 13. NOV 2025
Gennemgå de 12 “Ukendt” cases og give korrekte ID’er.

Sikre alle .md-cases har korrekt YAML-header.

Kør nyt clean-build og valider.

(Valgfrit) Starte API-integration til Vercel.

Version 1.0 | CDA ENGINE CLEAN ROADMAP
© Hans / CDA AI Systems – All rights reserved