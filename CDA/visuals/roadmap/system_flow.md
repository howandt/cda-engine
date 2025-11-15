# 🗺️ CDA System Flow – Fase 1
*Placering: CDA/visuals/roadmap/system_flow.md*  
*Version: 1.0.0 – Snapshot 2025-11-15*

---

## 🎯 Formål
At give et visuelt og logisk overblik over CDA-systemets struktur, dataflow og rolleforbindelser.

---

## 🔹 Datapunkter
born → paedagog → laerer → familiesager
↘ ↙
fagperson

yaml
Kopier kode

---

## 🔧 Flowforklaring
| Element | Funktion | Relation |
|----------|-----------|-----------|
| **born** | Indeholder børne-cases (typiske mønstre, udfordringer) | Datakilde for alle øvrige |
| **paedagog** | Relationel støtte, struktur og overgangsstrategier | Bro til skole og hjem |
| **laerer** | Undervisning, klassemiljø, pædagogisk struktur | Samspil med paedagog og fagperson |
| **fagperson** | Faglig analyse, intervention, rådgivning | Understøtter alle roller |
| **familiesager** | Hjemme- og forældreperspektiv | Samspil med barn, skole og paedagog |

---

## 🔁 Dataflow
1. **Cases** leveres fra `CDA/cases/`
2. **Taxonomy** styrer søgning og klassifikation  
3. **Views** filtrerer felter pr. læringslag  
4. **Docs + Meta** dokumenterer og versionerer systemet  
5. **Visuals** formidler overblik og udvikling  
6. **Tools** tester, validerer og integrerer  

---

## 🧩 Næste fase
- Udbyg visualisering til grafisk diagram (`structure_diagram.png`)
- Opret CDT-bridge: interaktiv læring og træning
- Automatisk snapshot-generering via script

---

*Sidst opdateret: 2025-11-15*  