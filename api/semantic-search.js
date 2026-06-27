import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return [normalize(value)].filter(Boolean);
  }

  return [];
}

function safeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value)
      .map((item) => safeText(item))
      .join(" ");
  }

  return String(value);
}

function loadAllCases() {
  const casesDir = path.join(
    process.cwd(),
    "public",
    "CDA",
    "cases"
  );

  if (!fs.existsSync(casesDir)) {
    throw new Error(`Case-mappe ikke fundet: ${casesDir}`);
  }

  const files = fs
    .readdirSync(casesDir)
    .filter(
      (file) =>
        file.toLowerCase().endsWith(".json") &&
        !file.toLowerCase().includes("index")
    );

  const uniqueCases = new Map();

  for (const file of files) {
    const filePath = path.join(casesDir, file);
    const parsed = readJsonFile(filePath);

    const fileCases = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.cases)
        ? parsed.cases
        : [];

    for (const caseItem of fileCases) {
      const caseId = normalize(caseItem.id);

      if (!caseId) {
        continue;
      }

      if (!uniqueCases.has(caseId)) {
        uniqueCases.set(caseId, {
          ...caseItem,
          _source_file: file,
        });
      }
    }
  }

  return Array.from(uniqueCases.values());
}

function buildSearchTerms(searchText, semantic) {
  const base = normalize(searchText);
  const words = base.split(/\s+/).filter(Boolean);
  const terms = new Set([base, ...words]);

  const synonyms = semantic?.synonyms || {};

  for (const [key, values] of Object.entries(synonyms)) {
    const normalizedKey = normalize(key);
    const normalizedValues = Array.isArray(values)
      ? values.map((value) => normalize(value)).filter(Boolean)
      : [];

    const keyMatched =
      base.includes(normalizedKey) ||
      words.includes(normalizedKey);

    const synonymMatched = normalizedValues.some(
      (value) =>
        base.includes(value) ||
        words.includes(value)
    );

    if (keyMatched || synonymMatched) {
      terms.add(normalizedKey);

      for (const value of normalizedValues) {
        terms.add(value);
      }
    }
  }

  return Array.from(terms).filter(
    (term) => term.length >= 2
  );
}

function getCaseFields(caseItem) {
  return {
    id: normalize(caseItem.id),

    title: normalize(
      caseItem.titel ||
      caseItem.title
    ),

    theme: normalize(
      safeText(
        caseItem.tema ||
        caseItem.theme ||
        caseItem.kategori
      )
    ),

    diagnoses: normalizeArray(
      caseItem.diagnoser ||
      caseItem.diagnoses ||
      caseItem.relevante_diagnoser
    ),

    environment: normalize(
      safeText(
        caseItem.miljø ||
        caseItem.contexts ||
        caseItem.kontekst
      )
    ),

    behavior: normalize(
      safeText(
        caseItem.adfærd ||
        caseItem.problem ||
        caseItem.kort_beskrivelse ||
        caseItem.description ||
        caseItem.beskrivelse
      )
    ),

    triggers: normalize(
      safeText(
        caseItem.triggers ||
        caseItem.trigger ||
        caseItem.udløsere
      )
    ),

    childPerspective: normalize(
      safeText(
        caseItem.barnets_oplevelse ||
        caseItem.barnets_perspektiv
      )
    ),

    solution: normalize(
      safeText(
        caseItem.løsning ||
        caseItem.tiltag ||
        caseItem.cda_guiding ||
        caseItem.værktøjer
      )
    ),
  };
}

function scoreCase(caseItem, searchTerms) {
  const fields = getCaseFields(caseItem);

  let score = 0;
  const matchedTerms = new Set();

  for (const term of searchTerms) {
    if (!term) {
      continue;
    }

    let termMatched = false;

    if (fields.id === term) {
      score += 150;
      termMatched = true;
    } else if (fields.id.includes(term)) {
      score += 60;
      termMatched = true;
    }

    if (fields.title === term) {
      score += 100;
      termMatched = true;
    } else if (fields.title.includes(term)) {
      score += 45;
      termMatched = true;
    }

    if (
      fields.diagnoses.some(
        (diagnosis) => diagnosis === term
      )
    ) {
      score += 80;
      termMatched = true;
    } else if (
      fields.diagnoses.some(
        (diagnosis) => diagnosis.includes(term)
      )
    ) {
      score += 40;
      termMatched = true;
    }

    if (fields.theme.includes(term)) {
      score += 25;
      termMatched = true;
    }

    if (fields.environment.includes(term)) {
      score += 20;
      termMatched = true;
    }

    if (fields.behavior.includes(term)) {
      score += 18;
      termMatched = true;
    }

    if (fields.triggers.includes(term)) {
      score += 16;
      termMatched = true;
    }

    if (fields.childPerspective.includes(term)) {
      score += 10;
      termMatched = true;
    }

    if (fields.solution.includes(term)) {
      score += 6;
      termMatched = true;
    }

    if (termMatched) {
      matchedTerms.add(term);
    }
  }

  if (matchedTerms.size > 1) {
    score += matchedTerms.size * 8;
  }

  return {
    score,
    matchedTerms: Array.from(matchedTerms),
  };
}

function toCompactResult(caseItem, scoreData) {
  return {
    id: caseItem.id || null,
    titel:
      caseItem.titel ||
      caseItem.title ||
      null,
    tema:
      caseItem.tema ||
      caseItem.theme ||
      caseItem.kategori ||
      null,
    diagnoser:
      caseItem.diagnoser ||
      caseItem.diagnoses ||
      caseItem.relevante_diagnoser ||
      [],
    miljø:
      caseItem.miljø ||
      caseItem.contexts ||
      caseItem.kontekst ||
      [],
    kort_beskrivelse:
      caseItem.kort_beskrivelse ||
      caseItem.problem ||
      caseItem.description ||
      caseItem.beskrivelse ||
      null,
    score: scoreData.score,
    matched_terms: scoreData.matchedTerms,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

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
    const searchText = String(
      req.query.search || ""
    ).trim();

    if (!searchText) {
      return res.status(400).json({
        success: false,
        error:
          "Ingen søgetekst angivet. Brug ?search=...",
      });
    }

    const semanticPath = path.join(
      process.cwd(),
      "public",
      "data",
      "semantic_engine.json"
    );

    const semantic = fs.existsSync(semanticPath)
      ? readJsonFile(semanticPath)
      : {};

    const cases = loadAllCases();

    const searchTerms = buildSearchTerms(
      searchText,
      semantic
    );

    const matches = cases
      .map((caseItem) => {
        const scoreData = scoreCase(
          caseItem,
          searchTerms
        );

        return {
          caseItem,
          scoreData,
        };
      })
      .filter(
        (item) => item.scoreData.score > 0
      )
      .sort(
        (a, b) =>
          b.scoreData.score - a.scoreData.score
      )
      .slice(0, 5)
      .map((item) =>
        toCompactResult(
          item.caseItem,
          item.scoreData
        )
      );

    return res.status(200).json({
      success: true,
      query: searchText,
      terms_used: searchTerms,
      total_unique_cases: cases.length,
      total_returned: matches.length,
      results: matches,
    });
  } catch (error) {
    console.error(
      "FEJL i /api/semantic-search:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}