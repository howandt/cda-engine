# 🧩 Koncept: Dynamic Quiz Engine (DQE)
*Placering: CDA/dev_notes/concepts/dynamic_quiz_engine.md*  
*Oprettet: 2025-11-15*  
*Status: aktiv*

---

## 🎯 Formål
At gøre quizdelen i CDT dynamisk, så spørgsmål genereres automatisk ud fra indholdet i hver CDA-case.  
Formålet er at undgå statiske quizzer og skabe variation og autentisk læring for hver session.

---

## 🔧 Funktionel idé
1. Brugeren vælger en case i CDT.
2. DQE læser casens `problem`, `solution` og `training`-felter.
3. Systemet genererer 5–10 multiple choice-spørgsmål ud fra casens kerneidéer.
4. Ved hver session vælges tilfældigt 3–5 spørgsmål.
5. Heidi evaluerer svarene og tildeler point (+10, +5, −5, −10).
6. Alle sessioner logges for at måle læringsprogression.

---

## 🧠 Teknisk tanke
- DQE kalder CDA’s JSON-case direkte.
- GPT genererer spørgsmål baseret på nøglerne: problem, intervention, solution.
- De genererede spørgsmål gemmes som cache-fil:
