// Trigger- og svar-normaliserings-lag.
//
// Genkender ja/nej-svar, rydder AI-svarets afsluttende "vil du have at
// jeg ogsaa..."-tilbud vaek, og afgoer om en besked bevidst peger paa
// et af de specialiserede sporingsflow (case, PBL, specialistpanel,
// skabelon m.fl.) frem for almindelig dialog.

function normalizeReplyIntent(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmativeReply(value) {
  const text = normalizeReplyIntent(value);
  return [
    "ja",
    "ja tak",
    "gerne",
    "det vil jeg gerne",
    "vis den",
    "send den",
    "lav den",
    "lad os gøre det",
    "lad os gore det"
  ].includes(text);
}

function isNegativeReply(value) {
  const text = normalizeReplyIntent(value);
  return [
    "nej",
    "nej tak",
    "ikke nu",
    "ellers tak",
    "det vil jeg ikke",
    "gå videre",
    "ga videre"
  ].includes(text);
}



function cleanCdaReplyTail(replyText) {
  let text = String(replyText || "").trim();

  if (!text) return "";

  const terminalOfferPatterns = [
    /\s*(?:Hvis du vil|Hvis du ønsker det),?\s+kan jeg(?:\s+også)?[\s\S]*?[.!?]\s*$/i,
    /\s*Jeg kan(?:\s+også)?\s+(?:lave|hjælpe|hjælpe dig|omsætte|sætte|skrive|formulere)[\s\S]*?[.!?]\s*$/i,
    /\s*Vil du have,?\s+at jeg[\s\S]*?[.!?]\s*$/i,
    /\s*Sig til,?\s+hvis[\s\S]*?[.!?]\s*$/i,
    /\s*(?:If you want|If you'd like),?\s+I can(?:\s+also)?[\s\S]*?[.!?]\s*$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;

    for (const pattern of terminalOfferPatterns) {
      const next = text.replace(pattern, "").trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }

  return text;
}

function extractPendingAction(replyText) {
  return {
    reply: String(replyText || "").trim(),
    pendingAction: null,
  };
}




function shouldUseSpecializedToolFlow(message) {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const explicitPatterns = [
    "vis en case",
    "find en case",
    "case om",
    "case med",
    "ga i dybden med en case",
    "gå i dybden med en case",
    "pbl",
    "projektbaseret læring",
    "lav et projekt",
    "find et projekt",
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "specialistperspektiv",
    "tværfaglig vurdering",
    "tvaerfaglig vurdering",
    "lav et skema",
    "lav en skabelon",
    "vis en skabelon",
    "handleplan",
    "støtteplan",
    "stoetteplan",
    "komorbiditet",
    "kan der være andet end",
    "kan der vaere andet end",
    "forklar diagnosen",
    "hvad er adhd",
    "hvad er autisme",
    "hvad er angst",
    "diagnoseopslag",
    "børnehaveoverlevering",
    "bornehaveoverlevering",
    "overlevering til skole"
  ];

  return explicitPatterns.some((pattern) => text.includes(pattern));
}



export {
  normalizeReplyIntent,
  isAffirmativeReply,
  isNegativeReply,
  cleanCdaReplyTail,
  extractPendingAction,
  shouldUseSpecializedToolFlow,
};
