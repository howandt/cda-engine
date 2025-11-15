# 💡 Udviklingsmappe – Fremtidige idéer
*Placering: CDA/dev_notes/ideas.md*  
*Startet: 2025-11-15*  
*Version: 1.0.0*

---

## 🎯 Formål
At fastholde koncepter, prototyper og fremtidige retninger for CDA/CDT-systemet, uden at påvirke den stabile hovedstruktur.  
Her parkeres idéer til senere udvikling, evaluering eller test.

---

## 🔹 IDÉ 1 – Læringsspil (CDA-Battle)
**Vision:** Gøre læring engagerende gennem konkurrence.  
**Beskrivelse:**  
- Quiz- og rollespilsformat mellem brugere eller skoler.  
- Pointsystem: +10 (korrekt), +5 (delvist), −5 (mangelfuldt), −10 (forkert).  
- Ranglister, badges, og teams.  
- Fokus: Motivation → læring gennem konkurrence.

---

## 🔹 IDÉ 2 – Brugerbidragne cases
**Vision:** Gør lærere og fagfolk til aktive medskabere.  
**Beskrivelse:**  
- Mulighed for at indsende egne cases og løsninger.  
- Heidi evaluerer fagligt og giver kvalitativ feedback.  
- Godkendte bidrag bliver nye træningsmoduler i CDT.  
- Systemet kan automatisk generere quiz ud fra indsendt tekst.

---

## 🔹 IDÉ 3 – Dynamic Quiz Engine (DQE)
**Vision:** Automatisk og levende spørgestruktur.  
**Beskrivelse:**  
- Genererer 5–10 spørgsmål dynamisk ud fra CDA-cases.  
- Trækker tilfældigt 3–5 spørgsmål pr. session.  
- Kan kobles med Heidi til feedback.  
- Lagring i `CDA/generated_quiz/`.

---

## 🔹 IDÉ 4 – Case Contribution Module (CCM)
**Vision:** Fagpersoner kan udvikle, dele og forbedre cases.  
**Beskrivelse:**  
- Web-interface til oprettelse af nye cases.  
- Automatisk metadata og versionering.  
- Mulighed for peer review eller AI-validering.  
- Integration med DQE og CDT.

---

## 🔹 IDÉ 5 – Fremtidig arkitektur
**Overblik:**
Heidi → feedback & vurdering
CDA → vidensbase og cases
CDT → læring og træning
DQE → generering af quiz og rollespil
CCM → bidrag og community

yaml
Kopier kode

---

## 🧭 Brug
Når du får en ny idé:
1. Skriv den kort ind under ny overskrift.
2. Marker den som **[aktiv]** hvis du vil arbejde videre på den snart.
3. Når du begynder at teste, flyt den til `concepts/`.
4. Når den er integreret i CDA/CDT, flyttes den til `archive/`.

---

## 🔹 IDÉ 6 – Automatisk Quizgenerator (Heidi-DQE)
**Vision:**  
At skabe et værktøj, hvor Heidi automatisk kan generere quizspørgsmål direkte ud fra en CDA-case.  
Systemet skal forstå casens indhold og danne realistiske læringsspørgsmål uden menneskelig redigering.

---

### 📘 Beskrivelse
- Læser casens felter: `problem`, `solution`, `training`, `reflection`
- Genererer 8–10 multiple choice-spørgsmål automatisk
- Tilføjer korrekt svar + feedback til hvert spørgsmål
- Gemmer som quizpool i:
CDA/generated_quiz/<case_id>_quizpool.json

yaml
Kopier kode
- Ved hver session vælger CDT tilfældigt 3–5 spørgsmål
- Pointsystem:
- +10 → korrekt  
- +5 → delvist korrekt  
- −5 → svagt svar  
- −10 → forkert
- Heidi giver feedback:
- Ros for det korrekte  
- Forklaring på hvorfor  
- Forslag til forbedring

---

### 🎯 Formål
At skabe variation og realistiske læringsoplevelser uden manuel opsætning,  
så alle cases kan bruges som dynamiske quiz-moduler i CDT.

---

### 🧭 Status
- [x] Idé fastholdt (2025-11-15)  
- [ ] Prototype-script (quiz_generator.py)  
- [ ] Integration med Heidi-feedback  
- [ ] Test på 3 cases

---

*Oprettet af: Hans (CDA-systemudvikling)*  
*Dato: 2025-11-15*