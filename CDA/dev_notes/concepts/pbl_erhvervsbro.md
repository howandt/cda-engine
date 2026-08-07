# PBL Erhvervsbro — koncept-spec

**Status:** Design/vision. Intet af dette er bygget i kode endnu.
**Dato:** 2026-08-07
**Relaterer til:** `data/CDA_PBL_Projects.json`

---

## 1. Hvorfor

Den nuværende PBL-tankegang har allerede bevæget sig fra "brug interessen til at parkere barnet roligt" til "brug interessen som motor for læring" (jf. `system_purpose.not: ["Ikke parkering", ...]`).

Næste skridt i visionen: brug interessen som **vej ind i en fremtid** — ikke kun faglig retning, men et reelt, langsigtet bånd til en virksomhed, der potentielt fører til ungarbejde, erhvervspraktik og på sigt en læreplads eller ansættelse.

Det centrale argument: en virksomhed, der har fulgt en elev over tid, kender eleven, kollegerne og de særlige behov allerede — i modsætning til en traditionel ansøgning, hvor al den viden først opbygges efter ansættelse. Systemet reducerer altså virksomhedens ansættelsesrisiko, samtidig med at det giver eleven en reel vej efter folkeskolen (uddannelse, speciel skole, eller direkte spor mod arbejdslivet — alt efter hvad der passer barnet).

En sidegevinst: når en virksomhed bidrager til et forløb, kan det blive til et **nyt PBL-projekt** i databasen, som andre elever senere kan bruge. Databasen vokser gennem partnerskaberne, ikke kun gennem manuelt forfatterskab.

---

## 2. Det, der allerede findes (grundlaget)

Disse dele af `CDA_PBL_Projects.json` findes allerede og genbruges direkte:

- **`career_alignment`** pr. projekt — kobler allerede hvert PBL-projekt til et erhverv/branche (fx "Landmand", "Murer", "Gartner").
- **`progression`** — hvert projekt peger på `next_projects`, så et forløb kan trappes op i sværhedsgrad over tid.
- **`opstartsplan`** — indfanger allerede elevprofil, mål og observationspunkter ved opstart (svarer til "uge 1: observation").
- **`progressionsskema`** — sporer niveau ved opstart, undervejs og afslutning.
- **`evalueringsrapport`** — inkl. "Anbefalet næste skridt" og "Anbefalinger til næste lærer eller fagperson".
- **`matching_algorithm`** — matcher elevprofil → interesse/diagnose/stimuli → passende næste projekt.

Det nye i dette dokument bygger ovenpå disse — ingen af dem skal ændres.

---

## 3. Nye datastrukturer

### 3.1 Virksomhedspartner

Ny fil, fx `data/CDA_Virksomhedspartnere.json`.

```json
{
  "id": "",
  "navn": "",
  "branche": "",                 // genbruger samme kategorier som career_alignment for ensartet matching
  "region": "",
  "kontaktperson": {
    "navn": "",
    "email": "",
    "telefon": ""
  },
  "kapacitet": {
    "antal_pladser": 0,
    "aldersspaend": { "fra": 0, "til": 0 },
    "timer_per_uge_tilbudt": 0
  },
  "vilkaar_accepteret": {
    "accepteret": false,
    "dato": null,
    "version": ""                // vilkårstekstens juridiske indhold formuleres af Hans/jurist, ikke af systemet
  },
  "status": "pending_review",    // pending_review | aktiv | pause
  "bidragede_forloeb": [],       // liste af PBL-projekt-id'er virksomheden har hjulpet med at skabe
  "partnerskab_historik": {
    "samarbejde_startet": null,
    "antal_elever_gennem_tiden": 0,
    "udfald": [
      { "elev_reference": "", "resultat": "laereplads | ungarbejde | ingen_fortsaettelse", "aar": null }
    ],
    "tillidsniveau": null,       // afledt af udfald over tid, ikke sat manuelt
    "fremtidig_kapacitet": null  // forventet antal pladser kommende skoleår
  }
}
```

### 3.2 Elev–virksomhed-bånd

Sporer den enkelte elevs relation til en virksomhed over tid. Holdes adskilt fra virksomhedsprofilen, så én virksomhed kan have flere aktive/afsluttede bånd.

```json
{
  "id": "",
  "elev_reference": "",
  "virksomhed_id": "",
  "type": "observationsbesoeg | erhvervspraktik | ungarbejde | mentorordning",
  "periode": { "start": null, "slut": null },
  "timer_per_uge": 0,
  "status": "aktiv | afsluttet | pause",
  "kendskabsgrad": {
    "samlet_timer_i_virksomheden": 0,
    "kender_kolleger": [],           // navngivne kontakter eleven har opbygget relation til
    "kender_rutiner": [],            // konkrete opgaver/rutiner eleven allerede mestrer
    "virksomhedens_vurdering": ""    // virksomhedens egen løbende tilbagemelding — adskilt fra CDA's pædagogiske evaluering
  },
  "evaluering": {
    // genbruger samme feltstruktur som eksisterende evalueringsrapport,
    // så det passer direkte ind i det, der allerede findes
  },
  "naeste_skridt": ""                // fx "fortsæt praktik", "peg mod ungarbejde", "peg mod uddannelse"
}
```

---

## 4. Matching-logik (udvidelse)

Udvider den eksisterende `matching_algorithm`:

1. Byg elevens `career_alignment`-historik ud fra gennemførte/igangværende PBL-forløb.
2. Filtrér `CDA_Virksomhedspartnere.json` på: matchende branche + elevens alder inden for virksomhedens `aldersspaend` + `status: aktiv` + `vilkaar_accepteret.accepteret: true` + ledig kapacitet.
3. Foreslå match, prioriteret efter virksomhedens `tillidsniveau` (etableret, erfaren partner vægtes højere end en helt ny, uafprøvet virksomhed).

---

## 5. Eksplicit uden for scope (endnu)

- **Selve vilkårsteksten** en virksomhed skal acceptere (ansvar, børnebeskyttelse, forpligtelser) — juridisk indhold, formuleres af Hans/jurist. Systemet tracker kun om og hvornår den er accepteret.
- **Faktisk virksomhedskontakt/aftaler** — dette er relationsopbygning, ikke software.
- Ingen kode er skrevet endnu. Dette dokument er alene grundlag for en senere beslutning om at bygge det.

---

## 6. Åbne spørgsmål til senere

- Hvordan formaliseres `tillidsniveau` — helt automatisk ud fra `udfald`, eller med en manuel vurdering fra skolen som supplement?
- Skal en elev kunne have bånd til flere virksomheder samtidig, eller kun én ad gangen?
- Hvornår i et PBL-forløb (hvilket "level": Junior/Intermediate/...) giver det mening at introducere et egentligt virksomhedsbånd første gang?
