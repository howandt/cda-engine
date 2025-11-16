# 📏 CDA – Standarder og Navngivningsregler
*Placering: CDA/docs/standards.md*  
*Version: 1.0.0 (2025-11-15)*  

---

## 🎯 Formål
At sikre fuld konsistens i navngivning, datastruktur og format i hele CDA-systemet.  
Alle nye cases, filer og felter skal følge disse standarder for at kunne indlæses og valideres automatisk.

---

## 🧱 1. Fil- og mappenavne
| Type | Regel | Eksempel |
|------|--------|----------|
| Mapper | små bogstaver, ingen mellemrum | `cases`, `taxonomy`, `meta` |
| Underkategorier | små bogstaver, æøå undgås | `børn`, `laerere`, `fagpersoner` |
| JSON-filer | `kategori-id-navn_alder.json` | `adhd_overgange_10-12.json` |
| Dokumenter | små bogstaver, underscores mellem ord | `system_version.json`, `methodology.md` |

**Regel:** Ingen specialtegn (`/ \ : * ? " < > |`) i filnavne.

---

## 🧩 2. JSON-format (cases)
- Indryk: **2 mellemrum**  
- Kodning: **UTF-8**  
- Alle felter skal følge `taxonomy.json`-ID’er  
- Ingen store bogstaver i feltnavne  
- Arrays bruges til lister (`intervention`, `tools`)  
- `training`-feltet skal altid indeholde `mode`, `question`, `options`, `answer`, `feedback`

Eksempel:
```json
{
  "id": "adhd_overgange_10-12",
  "title": "Overgange i skoledagen – dreng med ADHD (10-12 år)",
  "diagnosis": "adhd",
  "theme": "overgange",
  "context": "skole",
  "age_group": "10-12",
  "training": {
    "mode": "quiz",
    "question": "Hvordan kan læreren bedst støtte eleven?",
    "options": ["Visuel plan", "Verbal forklaring", "Ignorér uro"],
    "answer": "Visuel plan",
    "feedback": "Visuelle signaler giver forudsigelighed og ro."
  }
}

🧭 3. Versionering
Type	Betydning
Patch (x.x.1)	Små rettelser, ingen strukturelle ændringer
Minor (x.1.0)	Nye felter eller funktioner
Major (1.0.0)	Ændring i struktur eller kompatibilitet

Eksempel:
Når viewSchema.json får et nyt view → minor update (fx 1.1.0).
Når en ny mappe tilføjes (fx training/) → major update (fx 2.0.0).

🧩 4. Dokumentation og logning

Alle ændringer logges i CDA/meta/changelog.md

Versionsnummer i CDA/meta/system_version.json opdateres samtidig

Nye felter beskrives i CDA/docs/methodology.md under “Versions- og ændringsregler”

⚙️ 5. Filtest (validering)

Inden nye cases lægges ind:

Kør viewer_test.py for at sikre læsbarhed.

Kontroller, at alle felter findes i viewSchema.json.

Kontroller, at alle ID’er findes i taxonomy.json.

💡 6. Best Practice

Hold alle beskrivelser korte og handlingsorienterede.

Brug konsekvent nutid (“Eleven gør…” i stedet for “gjorde”).

Brug konkrete handlinger, ikke vurderinger.

Brug “reflection”-feltet til læring, ikke gentagelse.

🧾 7. Vedligeholdelsesprincip

“Et system er kun stærkt, når det kan vokse uden at bryde.”
Alle nye filer testes, logges og valideres, før de bliver en del af hovedstrukturen.

Sidst opdateret: 2025-11-15