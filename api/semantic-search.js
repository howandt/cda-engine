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

function buildSearchTerms(searchText, semantic) {
  const base = normalize(searchText);
  const terms = new Set([base]);

  const synonyms = semantic?.synonyms || {};

  for (const [key, values] of Object.entries(synonyms)) {
    const keyLower = normalize(key);
    const valueList = Array.isArray(values) ? values : [];

    if (base.includes(keyLower)) {
      terms.add(keyLower);
      valueList.forEach((v) => terms.add(normalize(v)));
      continue;
    }

    for (const value of valueList) {
      const valueLower = normalize(value);
      if (valueLower && base.includes(valueLower)) {
        terms.add(keyLower);
        valueList.forEach((v) => terms.add(normalize(v)));
      }
    }
  }

  return Array.from(terms).filter(Boolean);
}

function scoreCase(c, searchTerms) {
  const id = normalize(c.id);
  const titel = normalize(c.titel);
  const tema = normalize(c.tema);
  const beskrivelse = normalize(c.beskrivelse);
  const guiding = normalize(c.cda_guiding);
  const traening = normalize(c.cdt_træning);
  const diagnoser = Array.isArray(c.relevante_diagnoser)
    ? c.relevante_diagnoser.map((d) => normalize(d)).join(" ")
    : "";

  let score = 0;

  for (const term of searchTerms) {
    if (!term) continue;

    if (id === term) score += 100;
    else if (id.includes(term)) score += 40;

    if (titel === term) score += 80;
    else if (titel.includes(term)) score += 30;

    if (tema === term) score += 50;
    else if (tema.includes(term)) score += 20;

    if (diagnoser.includes(term)) score += 25;
    if (beskrivelse.includes(term)) score += 15;
    if (guiding.includes(term)) score += 10;
    if (traening.includes(term)) score += 10;
  }

  return score;
}

function toSearchResult(c, score) {
  return {
    id: c.id || null,
    titel: c.titel || null,
    tema: c.tema || null,
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

    const searchTerms = buildSearchTerms(searchText, semantic);

    const matchedCases = cases
      .map((c) => {
        const score = scoreCase(c, searchTerms);
        return { caseItem: c, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
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