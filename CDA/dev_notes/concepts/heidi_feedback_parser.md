# 🧩 Koncept: Heidi Feedback Parser (HFP)
*Placering: CDA/dev_notes/concepts/heidi_feedback_parser.md*  
*Oprettet: 2025-11-15*  
*Status: parkeret*

---

## 🎯 Formål
At opfange og strukturere Heidis feedback-output, så hver vurdering (tekst, point, kategori, forslag) gemmes som data.  
Parseren skal gøre Heidis svar målbare, søgbare og brugbare i rapporter og progressionstracking.

---

## 🔧 Funktionel idé
1. Heidi giver feedback på brugerens svar (tekst eller quiz).  
2. Parseren opdeler teksten i:
   - **ros-del** (positiv anerkendelse)
   - **refleksion-del** (overvejelse)
   - **forbedring-del** (konkret handling)
3. Uddrager pointværdi (+10, +5, −5, −10).  
4. Gemmer strukturen i logfil:
