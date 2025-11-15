# 🤖 Koncept: Heidi Feedback Engine (HFE)
*Placering: CDA/dev_notes/concepts/heidi_feedback_engine.md*  
*Oprettet: 2025-11-15*  
*Status: aktiv*

---

## 🎯 Formål
At beskrive og dokumentere Heidi – den intelligente AI-tutor, som driver al feedback, quiz-evaluering og læringsdialog i CDT-systemet.  
Heidi fungerer som empatisk, fagligt præcis AI med fokus på refleksion, læring og praksisnær vejledning.

---

## 🧠 Overordnet funktion
Heidi vurderer brugersvar i cases, quizzer og rollespil.  
Hun giver differentieret feedback, som både motiverer og korrigerer, og bruger point og refleksionsnøgler til at måle progression.

---

## 🔧 Arkitektur
- **Hovedprompt:** `CDT_Prompt_Heidi.md`  
- **Moduler:** Quiz, Case, Rollespil, Refleksion  
- **Evalueringslag:**
  - +10 → Korrekt og veldokumenteret løsning  
  - +5 → Delvist korrekt, men mangler nuancer  
  - −5 → Problematisk eller ufokuseret løsning  
  - −10 → Direkte uhensigtsmæssig tilgang  

Heidi anvender casens `problem`, `solution` og `context` til at afgøre læringsmål og rette feedback.

---

## 🎓 Læringsmodi
| Mode | Beskrivelse |
|------|--------------|
| 📚 **Teori** | Forklarer begreber, diagnoseviden, metoder |
| 🎭 **Case** | Bruger beskriver løsning → Heidi evaluerer (effektiv, delvist, problematisk) |
| 🎮 **Rollespil** | Simulerer interaktioner, sproglige valg og reaktioner |
| 🧠 **Quiz** | Diagnosebaserede multiple choice med point og feedback |

---

## 💬 Feedback-struktur
Heidi bruger tretrins-feedback:
1. **Ros** – “God løsning, fordi…”  
2. **Refleksion** – “Men overvej også…”  
3. **Forbedring** – “En bedre tilgang kunne være…”  

Feedbacken afsluttes altid med et læringsspørgsmål:
> “Hvad ville du gøre næste gang for at styrke barnets tryghed?”

---

## 🧩 Integration i CDT
- **Input:** brugerens tekst, valg eller svar  
- **Process:** vurdering → klassificering → feedback  
- **Output:** feedback + points + læringsforslag  
- **Log:** gemmes i `CDA/logs/heidi_feedback_<case_id>.jsonl`

---

## 💡 Samspil med andre systemer
- **CDA:** Leverer cases, træningsdata og kontekst  
- **CDT:** Viser feedback og point til brugeren  
- **DQE (Dynamic Quiz Engine):** Genererer quizspørgsmål, Heidi evaluerer dem  
- **CCM (Case Contribution Module):** Heidi kan validere brugergenererede cases  

---

## 🧭 Næste skridt
- [x] Prompt dokumenteret (CDT_Prompt_Heidi.md)  
- [ ] Bygge “feedback-parser” der gemmer Heidis vurdering og point  
- [ ] Integrere i CDT-runner (så Heidi bruges live i quiz og rollespil)  
- [ ] Logdata → læringsprogression  

---

*Oprettet af: Hans – CDA/CDT systemudvikling*  
*Dato: 2025-11-15*
