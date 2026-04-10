import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalize(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    return [normalize(value)].filter(Boolean);
  }
  return [];
}

function buildSearchTerms(searchText, semantic) {
  const base = normalize(searchText);
  const terms = new Set([base]);
  const synonyms = semantic?.synonyms || {};

  for (const [key, values] of Object.entries(synonyms)) {
    const keyLower = normalize(key);
    const valueList = Array.isArray(values) ? values : [];

    if (base === keyLower || base.includes(keyLower)) {
      terms.add(keyLower);
      valueList.forEach((v) => terms.add(normalize(v)));
      continue;
    }

    for (const value of valueList) {
      const valueLower = normalize(value);
      if (valueLower && (base === valueLower || base.includes(valueLower))) {
        terms.add(keyLower);
        valueList.forEach((v) => terms.add(normalize(v)));
      }
    }
  }

  return Array.from(terms).filter(Boolean);
}

function scoreTextMatch(c, searchTerms) {
  const id = normalize(c.id);
  const titel = normalize(c.titel);
  const temaList = normalizeArray(c.tema);
  const beskrivelse = normalize(c.beskrivelse);
  const guiding = normalize(c.cda_guiding);
  const traening = normalize(c.cdt_træning);

  let score = 0;

  for (const term of searchTerms) {
    if (!term) continue;

    if (id === term) score += 100;
    else if (id.includes(term)) score += 30;

    if (titel === term) score += 80;
    else if (titel.includes(term)) score += 35;

    if (temaList.includes(term)) score += 20;
    else if (temaList.some((t) => t.includes(term))) score += 8;

    if (beskrivelse.includes(term)) score += 6;
    if (guiding.includes(term)) score += 3;
    if (traening.includes(term)) score += 2;
  }

  return score;
}

function toSearchResult(c, score, matchType) {
  return {
    id: c.id || null,
    titel: c.titel || null,
    tema: Array.isArray(c.tema) ? c.tema : c.tema ? [c.tema] : [],
    relevante_diagnoser: Array.isArray(c.relevante_diagnoser)
      ? c.relevante_diagnoser
      : [],
    beskrivelse: c.beskrivelse || null,
    score,
    match_type: matchType,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      allowed_methods: ["GET"],
    });
  }

  try {
    const searchText = req.query.search?.toLowerCase().trim() || "";

    if (!searchText) {
      return res.status(400).json({
        success: false,
        error: "Ingen søgetekst angivet. Brug ?search=...",
      });
    }

    const casesPath = path.join(
      process.cwd(),
      "data",
      "cases_ORIGINAL_ARCHIVE",
      "adhd_angst_cases.json"
    );

    const semanticPath = path.join(
      process.cwd(),
      "public",
      "data",
      "semantic_engine.json"
    );

    const caseData = readJsonFile(casesPath);
    const cases = Array.isArray(caseData) ? caseData : caseData.cases || [];

    let semantic = {};
    if (fs.existsSync(semanticPath)) {
      semantic = readJsonFile(semanticPath);
    }

    const primaryTerm = normalize(searchText);
    const searchTerms = buildSearchTerms(searchText, semantic);

    const primaryMatches = [];
    const comorbidMatches = [];
    const textMatches = [];

    for (const c of cases) {
      const diagnoser = normalizeArray(c.relevante_diagnoser);
      const textScore = scoreTextMatch(c, searchTerms);

      const primaryDiagnosis = diagnoser[0] || "";
      const hasPrimaryDiagnosis = primaryDiagnosis === primaryTerm;
      const hasComorbidDiagnosis =
        !hasPrimaryDiagnosis && diagnoser.slice(1).includes(primaryTerm);

      if (hasPrimaryDiagnosis) {
        primaryMatches.push(
          toSearchResult(c, 500 + textScore, "primary_diagnosis")
        );
        continue;
      }

      if (hasComorbidDiagnosis) {
        comorbidMatches.push(
          toSearchResult(c, 250 + textScore, "comorbid_diagnosis")
        );
        continue;
      }

      if (textScore > 0) {
        textMatches.push(
          toSearchResult(c, textScore, "text_match")
        );
      }
    }

    primaryMatches.sort((a, b) => b.score - a.score);
    comorbidMatches.sort((a, b) => b.score - a.score);
    textMatches.sort((a, b) => b.score - a.score);

    const limitedPrimary = primaryMatches.slice(0, 10);
    const limitedComorbid = comorbidMatches.slice(0, 10);
    const limitedText = textMatches.slice(0, 10);

    return res.status(200).json({
      success: true,
      query: searchText,
      terms_used: searchTerms,
      summary: {
        primary_matches: limitedPrimary.length,
        comorbid_matches: limitedComorbid.length,
        text_matches: limitedText.length,
        total_returned:
          limitedPrimary.length + limitedComorbid.length + limitedText.length,
      },
      primary_matches: limitedPrimary,
      comorbid_matches: limitedComorbid,
      text_matches: limitedText,
    });
  } catch (error) {
    console.error("❌ FEJL i /api/semantic-search:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}