# 🧭 CDA – Arbejdsmetode og Struktur
*Placering: CDA/docs/methodology.md*  
*Version: 1.0.0 (2025-11-15)*  

---

## 🎯 Formål
At sikre en ensartet, stabil og udvidelsesvenlig arbejdsmetode for udvikling og vedligeholdelse af CDA-systemet.  
Alt arbejde foregår i små, testbare trin – ingen større ændringer uden validering.  

---

## ⚙️ Grundprincipper
1. **Ét fokus ad gangen**  
   - Ingen parallel udvikling. Ét modul testes, før næste påbegyndes.  
2. **Intet datatab**  
   - Alle ændringer dokumenteres i `CDA/meta/changelog.md`.  
3. **Struktur før indhold**  
   - Systemets ramme defineres, før cases tilføjes.  
4. **Alt skal kunne bruges i praksis**  
   - Ingen teoretiske funktioner uden konkret anvendelse.  
5. **Versionsstyring og dokumentation**  
   - `system_version.json` angiver systemstatus.  
   - Ændringer logges i changelog.  

---

## 🧩 Arbejdsgang (Step-by-step)
| Trin | Beskrivelse | Output |
|------|--------------|--------|
| 1 | Definér struktur eller funktion | Mappestruktur, JSON-format |
| 2 | Opret test-data | 1–2 cases, visning testet |
| 3 | Kør `viewer_test.py` | Bekræft funktion |
| 4 | Log ændringen i changelog | Ny version noteres |
| 5 | Opdater `system_version.json` | Ved strukturelle ændringer |
| 6 | Gem backup | Hele CDA-mappen kopieres (manuelt eller via script) |

---

## 📂 Filstruktur (reference)
CDA/
├── cases/
├── taxonomy/
├── views/
├── meta/
├── visuals/
├── docs/
└── tools/

yaml
Kopier kode

---

## 🧱 Versions- og ændringsregler
- **Små ændringer (indhold, cases)** → changelog opdateres, version uændret  
- **Middel ændringer (nye felter, nye view-niveauer)** → version +0.1  
- **Store ændringer (strukturændring, nye moduler)** → version +1.0  

---

## 🧩 Test- og kontrolpunkter
- Viewer-testen (`viewer_test.py`) skal altid kunne læse alle views.  
- Nye felter i `taxonomy.json` skal testes med en dummy-case, før brug.  
- Nye cases skal valideres mod eksisterende taxonomy-ID’er.  

---

## 🧭 Fremadrettet udvikling
- Udbyg **CDT-modulerne** baseret på `training`-felterne i cases.  
- Opret grafiske oversigter i `CDA/visuals/roadmap/`.  
- Implementér `update_log.py` (automatisk changelog-opdatering).  

---

## 💡 Filosofi
> *"Struktur skaber frihed."*  
Når rammen er tydelig, bliver kreativt og fagligt arbejde nemt.  
Alt i CDA skal kunne forstås, ændres og bruges af en ny person uden oplæring.

---

## 🧾 Vedligehold
- Tjek `system_version.json` månedligt.  
- Arkivér changelog som PDF kvartalsvis.  
- Tag backup af hele CDA/ før større ændringer.  

---

*Sidst opdateret: 2025-11-15*