# CDA Engine – Dataserver (v2025.11)

Dette repository udgør **den officielle dataserver for CDA-GPT** – en del af *Children Diagnosis AI Systems*.  
Repoet stiller validerede data til rådighed for AI-baseret rådgivning, analyse og pædagogisk støtte.

---

## 🎯 Formål

At levere **rene, vedligeholdelsesvenlige og dynamiske JSON- og markdown-datasæt** til brug i:

- CDA-GPT (Children Diagnosis Adviser)
- CDT-GPT (Testvejleder)
- CDF-GPT (Familierådgiver)

Dataserveren er **frontend-uafhængig** og hostes via GitHub + Vercel som statisk API.

---

## 📁 Struktur og indhold

| Mappe / fil | Indhold |
|-------------|---------|
| `/public/cases/` | Reelle kliniske cases i `.md`-format med YAML metadata |
| `/public/data/CDA_Cases_Index.json` | Master-index over alle cases |
| `/public/data/CDA_Cases_Index_CLEAN.json` | Let version til hurtig brug i GPT |
| `/scripts/clean-index.js` | Script til at generere clean-index fra master |
| `/templates/` | Skabeloner til intervention, støtte og struktur |
| `/pbl/` | Projektbaserede læringsforløb (8–12 uger) |
| `/quiz/` | Vidensquizzer til test og træning |
| `/specialister/CDA_SpecialistPanel.json` | Specialistpanelets profiler og tone |
| `/diagnoser/` | Markdown-filer for hver diagnose (ADHD, ASF, angst...) |
| `CDA_Diagnoser.json` | Metadata for diagnoser og relationer |
| `vercel.json` | Konfiguration til Vercel API-hosting |

---

## ⚙️ Teknisk brug

1. Klon repo:
   ```bash
   git clone https://github.com/[bruger]/cda-engine-clean.git
