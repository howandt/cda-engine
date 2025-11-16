# 📜 CDA – Changelog
*Placering: CDA/meta/changelog.md*  
*System: CDA v1.0.0*  
*Startdato: 15. november 2025*

---

## 🧱 Version 1.0.0  –  Systemfundament
**Dato:** 2025-11-15  
**Status:** Stabil  

### 🔹 Oprettet
- Grundstruktur for CDA mappesystem:
CDA/
├── cases/
├── taxonomy/
├── views/
├── meta/
├── visuals/
├── docs/
└── tools/
- `taxonomy.json` – definering af diagnoser, temaer, roller, kontekster og aldersgrupper  
- `viewSchema.json` – visningslag (overview, solution, training)  
- `system_version.json` – versionskontrol og kompatibilitet  
- Første test-case: `adhd_overgange_10-12.json`  
- Viewer-testscript: `viewer_test.py`  

### 🔹 Bekræftet funktion
- Viewer læser cases korrekt i alle tre lag.  
- Filsystem fungerer uden konflikter.  

---

## 📅 Kommende (planlagt)
- Udbygning af **lærere-, fagperson- og familiesager-cases**  
- Oprettelse af **metodologidokumentation** (`CDA/docs/methodology.md`)  
- Implementering af **CDT-integration (læringsmoduler)**  
- Automatisk generering af changelog via script (`CDA/tools/update_log.py`)

---

*Note:*  
Hver ny ændring, tilføjelse eller rettelse dokumenteres her i markdown-format.  
Hold loggen kort, men præcis.  

Version X.X.X – [kort beskrivelse]

[ændring]

[tilføjelse]

---

🧩 **Vedligeholdelsesprincip:**  
> Ingen ændring i struktur eller data uden opdatering af changelog og system_version.json.
