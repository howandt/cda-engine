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

function scoreCase(c, searchTerms, primaryTerm) {
  const id = normalize(c.id);
  const titel = normalize(c.titel);
  const temaList = normalizeArray(c.tema);
  const diagnoserList = normalizeArray(c.relevante_diagnoser);
  const beskrivelse = normalize(c.beskrivelse);
  const guiding = normalize(c.cda_guiding);
  const traening = normalize(c.cdt_træning);

  let score = 0;
  let strongMatch = false;
  let exactDiagnosisMatch = false;

  for (const term of searchTerms) {
    if (!term) continue;

    // ID
    if (id === term) {
      score += 150;
      strongMatch = true;
    } else if (id.includes(term)) {
      score += 40;
    }

    // Titel
    if (titel === term) {
      score += 120;
      strongMatch = true;
    } else if (titel.includes(term)) {
      score += 50;
    }

    // Diagnoser - tungeste felt
    if (diagnoserList.includes(term)) {
      score += 220;
      strongMatch = true;
      if (term === primaryTerm) {
        exactDiagnosisMatch = true;
      }
    } else if (diagnoserList.some((d) => d.includes(term))) {
      score += 80;
      strongMatch = true;
    }

    // Tema
    if (temaList.includes(term)) {
      score += 30;
    } else if (temaList.some((t) => t.includes(term))) {
      score += 12;
    }

    // Svag støtte fra tekst
    if (beskrivelse.includes(term)) score += 6;
    if (guiding.includes(term)) score += 2;
    if (traening.includes(term)) score += 2;
  }

  // Bonus hvis primær søgning findes direkte i titel
  if (primaryTerm && titel.includes(primaryTerm)) {
    score += 35;
  }

  // Kraftig bonus for eksakt diagnosematch
  if (exactDiagnosisMatch) {
    score += 300;
  }

  return { score, strongMatch, exactDiagnosisMatch };
}

function toSearchResult(c, score) {
  return {
    id: c.id || null,
    titel: c.titel || null,
    tema: Array.isArray(c.tema) ? c.tema : c.tema ? [c.tema] : [],
    relevante_diagnoser: Array.isArray(c.relevante_diagnoser)
      ? c.relevante_diagnoser
      : [],
    beskrivelse: c.beskrivelse || null,
    score,
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

    const scoredCases = cases
      .map((c) => {
        const result = scoreCase(c, searchTerms, primaryTerm);
        return {
          caseItem: c,
          score: result.score,
          strongMatch: result.strongMatch,
          exactDiagnosisMatch: result.exactDiagnosisMatch,
        };
      })
      .filter((item) => item.score > 0);

    const exactDiagnosisMatches = scoredCases.filter((item) => item.exactDiagnosisMatch);
    const strongMatches = scoredCases.filter((item) => item.strongMatch);

    let pool = scoredCases;
    if (exactDiagnosisMatches.length > 0) {
      pool = exactDiagnosisMatches;
    } else if (strongMatches.length > 0) {
      pool = strongMatches;
    }

    const matchedCases = pool
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => toSearchResult(item.caseItem, item.score));

    return res.status(200).json({
      success: true,
      query: searchText,
      matches: matchedCases.length,
      results: matchedCases,
      terms_used: searchTerms,
    });
  } catch (error) {
    console.error("❌ FEJL i /api/semantic-search:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}