import fs from "fs";
import path from "path";

const EMOTION_DATA_PATH = path.join(
  process.cwd(),
  "data",
  "CDA_Emotionengine.json"
);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOutput(value) {
  return String(value || "")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readEmotionData() {
  if (!fs.existsSync(EMOTION_DATA_PATH)) {
    throw new Error(`Datafil ikke fundet: ${EMOTION_DATA_PATH}`);
  }

  return JSON.parse(fs.readFileSync(EMOTION_DATA_PATH, "utf8"));
}

function stemWord(word) {
  let value = word;
  for (const suffix of ["ende", "erne", "ene", "er", "en", "et", "e", "t"]) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 4) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return value.replace(/([a-z])\1$/, "$1");
}

function containsTerm(text, term) {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedText || !normalizedTerm) return false;
  if (` ${normalizedText} `.includes(` ${normalizedTerm} `)) return true;
  if (normalizedTerm.includes(" ")) return false;

  const termStem = stemWord(normalizedTerm);
  return normalizedText
    .split(" ")
    .some((word) => stemWord(word) === termStem);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getCategoryTerms(info) {
  return unique([
    ...(Array.isArray(info?.words) ? info.words : []),
    ...(Array.isArray(info?.phrases) ? info.phrases : []),
  ]);
}

function extractQuotedText(message) {
  const normalizedQuotes = String(message || "").replace(/[“”„«»]/g, '"');
  const matches = Array.from(
    normalizedQuotes.matchAll(/"([^"\n]{2,1200})"/g),
    (match) => match[1].trim()
  ).filter(Boolean);

  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

function extractTextAfterColon(message) {
  const source = String(message || "");
  const colonIndex = source.indexOf(":");
  if (colonIndex < 0) return null;

  const candidate = source.slice(colonIndex + 1).trim();
  return candidate.length >= 2 ? candidate.slice(0, 1200) : null;
}

function extractTextAfterSpeechMarker(message) {
  const source = String(message || "");
  const match = /\b(jeg sagde|jeg siger|jeg skrev|jeg skriver)\b/i.exec(source);
  if (!match) return null;

  let candidate = source.slice(match.index + match[0].length).trim();
  candidate = candidate.replace(/^til\s+[^,:.!?]{1,80}[,:]\s*/i, "");
  candidate = candidate.split(
    /\s+(?=hvordan\b|hvad\s+kan\b|kan\s+du\b|vil\s+du\b)/i
  )[0].trim();

  return candidate.length >= 2 ? candidate.slice(0, 1200) : null;
}

export function resolveEmotionRequest(message = "") {
  const text = normalizeText(message);
  if (!text) return { matched: false, targetText: null, source: null };

  const intentPatterns = [
    "jeg sagde",
    "jeg siger",
    "jeg skrev",
    "jeg skriver",
    "mine ord",
    "min formulering",
    "denne formulering",
    "den her formulering",
    "analyser min kommunikation",
    "analyser denne kommunikation",
    "analyser formuleringen",
    "hvordan kan mine ord påvirke",
    "hvordan virker det på barnet",
    "hvordan lyder det",
    "hvad kan jeg sige i stedet",
    "bedre formulering",
  ];

  const matched = intentPatterns.some((pattern) =>
    text.includes(normalizeText(pattern))
  );

  if (!matched) {
    return { matched: false, targetText: null, source: null };
  }

  const quotedText = extractQuotedText(message);
  if (quotedText) {
    return { matched: true, targetText: quotedText, source: "quote" };
  }

  const colonText = extractTextAfterColon(message);
  if (colonText) {
    return { matched: true, targetText: colonText, source: "after_colon" };
  }

  const speechText = extractTextAfterSpeechMarker(message);
  if (speechText) {
    return { matched: true, targetText: speechText, source: "speech_marker" };
  }

  return {
    matched: true,
    targetText: null,
    source: "missing_communication_text",
  };
}

export function isEmotionAnalysisRequest(message = "") {
  const request = resolveEmotionRequest(message);
  return request.matched && Boolean(request.targetText);
}

export function analyzeEmotion(text, data = readEmotionData()) {
  const foundElements = {};
  let score = 0;

  for (const [category, info] of Object.entries(data.word_categories || {})) {
    const hits = getCategoryTerms(info).filter((term) => containsTerm(text, term));
    foundElements[category] = hits;
    score += hits.length * Number(info?.score_value || 0);
  }

  const normalizedFoundElements = {
    positive: foundElements.positive || [],
    negative: foundElements.negative || [],
    empathy: foundElements.empathy || [],
    commands: foundElements.commands || [],
    validating: foundElements.validating || [],
  };

  let mood = "neutral";
  if (score >= 3) mood = "støttende";
  else if (score >= 1) mood = "rolig";
  else if (score <= -2) mood = "pres";
  else if (score < 0) mood = "spændt";

  const moodData = data.mood_levels?.[mood] || {};

  return {
    score,
    mood,
    emoji: moodData.emoji || null,
    description: moodData.description || null,
    effect_on_child: moodData.effect_on_child || null,
    characteristics: moodData.characteristics || [],
    found_elements: normalizedFoundElements,
    word_count: Object.fromEntries(
      Object.entries(normalizedFoundElements).map(([category, hits]) => [
        category,
        hits.length,
      ])
    ),
  };
}

function tokenize(value) {
  const stopWords = new Set([
    "alle",
    "andre",
    "den",
    "der",
    "det",
    "for",
    "ikke",
    "jeg",
    "kan",
    "med",
    "skal",
    "som",
    "til",
    "var",
  ]);

  return unique(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !stopWords.has(word))
      .map(stemWord)
  );
}

export function findSimilarEmotionExamples(text, examples = []) {
  const inputWords = new Set(tokenize(text));

  return (Array.isArray(examples) ? examples : [])
    .map((example) => {
      const exampleWords = tokenize(example?.bad_communication);
      const matchCount = exampleWords.filter((word) => inputWords.has(word)).length;
      return { example, matchCount };
    })
    .filter(({ matchCount }) => matchCount >= 1)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 2)
    .map(({ example }) => ({
      situation: example.situation || null,
      your_communication: text,
      similar_to: example.bad_communication || null,
      better_alternative: example.good_communication || null,
      why_better: example.analysis_good?.strengths || null,
    }));
}

export function getEmotionImprovements(text, analysis, data = readEmotionData()) {
  const suggestions = [];
  const improvementData = data.improvement_suggestions || {};
  const negative = analysis?.found_elements?.negative || [];
  const commands = analysis?.found_elements?.commands || [];
  const found = new Set([...negative, ...commands].map(normalizeText));

  const addSuggestion = (problem, key, category) => {
    const alternatives = improvementData[key]?.use_instead || [];
    if (alternatives.length === 0) return;
    suggestions.push({ problem, suggestion: alternatives, category });
  };

  if (found.has("skal") || found.has("du skal")) {
    addSuggestion("'Skal' kan opleves som et hårdt krav", "replace_skal", "kommando");
  }

  if (
    found.has("stop") ||
    found.has("stop det") ||
    found.has("hold op") ||
    found.has("hold op med")
  ) {
    addSuggestion(
      "'Stop' eller 'hold op' kan opleves som afvisning",
      "replace_stop",
      "kommando"
    );
  }

  if (found.has("hvorfor")) {
    addSuggestion(
      "'Hvorfor' kan opleves som kritik i en presset situation",
      "replace_hvorfor",
      "spørgsmål"
    );
  }

  if (found.has("dum") || found.has("forkert")) {
    addSuggestion("Kritiske ord kan skabe skam", "replace_criticism", "kritik");
  }

  if (
    analysis?.word_count?.empathy === 0 &&
    analysis?.word_count?.validating === 0
  ) {
    suggestions.push({
      problem: "Ingen empatiske eller validerende elementer fundet",
      suggestion: (data.communication_tips || []).slice(0, 4),
      category: "empati",
    });
  }

  return suggestions;
}

export function getEmotionDataset() {
  const data = readEmotionData();
  return {
    version: data.version || null,
    description: data.description || null,
    purpose: data.purpose || null,
    word_categories: data.word_categories || {},
    mood_levels: data.mood_levels || {},
    examples: data.examples || [],
    improvement_suggestions: data.improvement_suggestions || {},
    communication_tips: data.communication_tips || [],
  };
}

export function getEmotionAnalysis({ text, context = null } = {}) {
  const inputText = String(text || "").trim();
  if (!inputText) return { error: "Tekst mangler" };

  const data = readEmotionData();
  const analysis = analyzeEmotion(inputText, data);

  return {
    input: { text: inputText, context },
    analysis,
    similar_examples: findSimilarEmotionExamples(inputText, data.examples || []),
    improvements: getEmotionImprovements(inputText, analysis, data),
    communication_tips: data.communication_tips || [],
  };
}

export function getEmotionSignals({ message = "" } = {}) {
  const request = resolveEmotionRequest(message);
  if (!request.matched || !request.targetText) {
    return { matched: false, matched_categories: [] };
  }

  const result = getEmotionAnalysis({ text: request.targetText });
  if (result.error) {
    return { matched: false, matched_categories: [], error: result.error };
  }

  const matchedCategories = Object.entries(result.analysis.found_elements || {})
    .filter(([, hits]) => Array.isArray(hits) && hits.length > 0)
    .map(([category, hits]) => ({ category, hits }));

  return {
    matched: true,
    target_text: request.targetText,
    target_source: request.source,
    analysis: result.analysis,
    matched_categories: matchedCategories,
    similar_examples: result.similar_examples,
    improvements: result.improvements,
    communication_tips: result.communication_tips.slice(0, 5),
  };
}

function buildEmotionInstructions({
  heidiPrompt,
  audienceInstructions,
  activeCaseInstructions,
  responseStyle,
}) {
  const styleInstruction =
    responseStyle === "Kort"
      ? "Svar kort med påvirkning, én bedre formulering og højst 2 handlinger."
      : responseStyle === "Dyb"
        ? "Forklar påvirkning, regulering, grænsesætning og relationel reparation grundigt, men uden gentagelser."
        : "Forklar påvirkningen kort og giv 2-3 konkrete bedre formuleringer.";

  return [
    heidiPrompt,
    "",
    audienceInstructions,
    "",
    activeCaseInstructions,
    "",
    "CDA EMOTIONMOTOR",
    "Analysér kun den udskilte voksenformulering. Bland ikke brugerens spørgsmål eller tidligere Heidi-svar ind i selve sproganalysen.",
    "Brug den vedlagte dataanalyse som fagligt grundlag. Vis ikke interne scores, ids eller datastruktur, medmindre brugeren udtrykkeligt beder om en score.",
    "Beskriv barnets mulige oplevelse sikkert og nuanceret; påstå ikke, at barnet med sikkerhed føler noget bestemt.",
    "Anerkend kort den voksnes hensigt uden at bortforklare virkningen.",
    "Bevar en tydelig grænse og barnets plads i fællesskabet samtidig. Regulering og grænsesætning skal støtte hinanden, ikke udskydes som modsætninger.",
    "Giv korte, naturlige sætninger den voksne faktisk kan sige. Undgå uklare vendinger og krav om, at barnet straks skal få kroppen i ro.",
    "Hvis ordene allerede er sagt, medtag en kort relationel reparation, når det er relevant.",
    "Nævn ikke skabeloner, specialistpanel eller andre CDA-moduler, medmindre brugeren udtrykkeligt beder om dem.",
    styleInstruction,
  ].filter(Boolean).join("\n");
}

export async function runEmotionFlow({
  openai,
  model = "gpt-5.4-mini",
  heidiPrompt,
  audienceInstructions,
  activeCaseInstructions,
  message,
  language,
  role,
  responseStyle,
}) {
  const request = resolveEmotionRequest(message);
  if (!request.matched || !request.targetText) {
    throw new Error("Emotionmotoren modtog ingen tydelig voksenformulering");
  }

  const emotionContext = getEmotionAnalysis({ text: request.targetText });
  if (emotionContext.error) throw new Error(emotionContext.error);

  const response = await openai.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: buildEmotionInstructions({
      heidiPrompt,
      audienceInstructions,
      activeCaseInstructions,
      responseStyle,
    }),
    input: [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "UDSKILT VOKSENFORMULERING:",
      request.targetText,
      "",
      "CDA EMOTIONDATA:",
      JSON.stringify(emotionContext, null, 2),
    ].join("\n"),
    max_output_tokens:
      responseStyle === "Dyb" ? 1800 : responseStyle === "Kort" ? 700 : 1000,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra emotionmotoren");
  }

  const outputText = cleanOutput(response.output_text || "");
  if (!outputText) throw new Error("Emotionmotoren returnerede intet svar");

  return {
    response,
    outputText,
    usedDataSources: ["emotionEngine:v2", "CDA_Emotionengine.json"],
    debug: {
      language,
      role,
      response_style: responseStyle,
      target_source: request.source,
      mood: emotionContext.analysis.mood,
      score: emotionContext.analysis.score,
      found_elements: emotionContext.analysis.found_elements,
    },
  };
}
