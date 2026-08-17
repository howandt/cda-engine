import fs from "fs";
import path from "path";

function readTextFile(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }

  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile(filePath, errorMessage) {
  const raw = readTextFile(filePath, errorMessage);
  return JSON.parse(raw);
}

function normalizeDiagnosisPhrase(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsDiagnosisPhrase(normalizedText, phrase) {
  const normalizedPhrase = normalizeDiagnosisPhrase(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function compactCaseText(value, max = 260) {
  const text = formatLocalCaseValue(value).replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max).trim()}…`;
}

function hasActiveCaseContext(context) {
  return Boolean(
    context?.active &&
      (
        context.summary ||
        context.known_context ||
        context.last_user_message ||
        context.last_heidi_reply ||
        context.last_guidance_summary
      )
  );
}

function normalizeCaseAge(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/\d{1,2}/);
  return match ? Number(match[0]) : null;
}

function extractRequestedCaseAge(value) {
  const text = String(value || "").toLowerCase();
  const match = text.match(/\b(\d{1,2})\s*(?:år|aar|yo|y\/o)?\b/);
  if (!match) return null;
  const age = Number(match[1]);
  return age >= 2 && age <= 25 ? age : null;
}

function extractRequestedCaseGender(value) {
  const text = normalizeDiagnosisPhrase(value);
  if (["pige", "hun", "hende", "girl"].some((word) => containsDiagnosisPhrase(text, word))) {
    return "female";
  }
  if (["dreng", "han", "ham", "boy"].some((word) => containsDiagnosisPhrase(text, word))) {
    return "male";
  }
  return null;
}

function inferCaseGender(caseItem = {}) {
  const explicit = normalizeDiagnosisPhrase(
    caseItem.køn || caseItem.koen || caseItem.gender || caseItem.sex
  );

  if (["pige", "kvinde", "female", "girl"].some((word) => explicit.includes(word))) {
    return "female";
  }

  if (["dreng", "mand", "male", "boy"].some((word) => explicit.includes(word))) {
    return "male";
  }

  const nameText = normalizeDiagnosisPhrase([
    caseItem.titel,
    caseItem.title,
    caseItem.navn,
    caseItem.name,
    caseItem.childVoice,
  ].filter(Boolean).join(" "));

  const femaleNames = [
    "mia", "emma", "sophie", "sofie", "nora", "lea", "sofia", "maya", "anna", "ida", "maja", "sara", "freja", "amalie", "clara", "laura"
  ];

  const maleNames = [
    "alex", "noah", "emil", "marcus", "oliver", "ethan", "jonathan", "lucas", "villads", "oscar", "william", "malthe", "magnus", "jens"
  ];

  if (femaleNames.some((name) => containsDiagnosisPhrase(nameText, name))) {
    return "female";
  }

  if (maleNames.some((name) => containsDiagnosisPhrase(nameText, name))) {
    return "male";
  }

  return null;
}

function getSemanticSearch(args = {}) {
  const searchText = String(args.search || "").trim();

  if (!searchText) {
    return {
      success: false,
      error: "Ingen søgetekst angivet",
    };
  }

  const normalizeSemantic = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const normalizeSemanticArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeSemantic(item))
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return [normalizeSemantic(value)].filter(Boolean);
    }

    return [];
  };

  const semanticSafeText = (value) => {
    if (value === null || value === undefined) return "";

    if (Array.isArray(value)) {
      return value.map((item) => semanticSafeText(item)).join(" ");
    }

    if (typeof value === "object") {
      return Object.values(value)
        .map((item) => semanticSafeText(item))
        .join(" ");
    }

    return String(value);
  };

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
    const parsed = readJsonFile(
      filePath,
      `Casefil kunne ikke læses: ${file}`
    );

    const fileCases = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.cases)
        ? parsed.cases
        : [];

    for (const caseItem of fileCases) {
      const caseId = normalizeSemantic(caseItem.id);

      if (caseId && !uniqueCases.has(caseId)) {
        uniqueCases.set(caseId, caseItem);
      }
    }
  }

  const semanticPath = path.join(
    process.cwd(),
    "public",
    "data",
    "semantic_engine.json"
  );

  const semantic = fs.existsSync(semanticPath)
    ? readJsonFile(
        semanticPath,
        "public/data/semantic_engine.json kunne ikke læses"
      )
    : {};

  const base = normalizeSemantic(searchText);
  const words = base.split(/\s+/).filter(Boolean);
  const terms = new Set([base, ...words]);
  const synonyms = semantic?.synonyms || {};

  for (const [key, values] of Object.entries(synonyms)) {
    const normalizedKey = normalizeSemantic(key);
    const normalizedValues = Array.isArray(values)
      ? values.map((value) => normalizeSemantic(value)).filter(Boolean)
      : [];

    const keyMatched =
      base.includes(normalizedKey) || words.includes(normalizedKey);

    const synonymMatched = normalizedValues.some(
      (value) => base.includes(value) || words.includes(value)
    );

    if (keyMatched || synonymMatched) {
      terms.add(normalizedKey);
      normalizedValues.forEach((value) => terms.add(value));
    }
  }

  // 23B.9I: Danske stopord fjernes, saa scoringen ikke fyldes med
  // grammatiske fyldord ("han", "er", "paa"), som findes i naesten alle cases
  // uanset emne, og som ellers overdoever de faktisk betydningsbaerende ord.
  // OBS: skriv ordene med rigtige æ/ø/å-tegn her — normalizeSemantic()
  // konverterer dem til samme normaliserede form som søgeteksten (fx "på" -> "pa"),
  // så en manuel ascii-tilnærmelse (fx "paa") IKKE ville matche korrekt.
  const stopwordList = [
    "han", "hun", "den", "det", "de", "vi", "jeg", "du", "man", "ham", "hende",
    "er", "var", "være", "blive", "bliver", "blev", "har", "havde", "kan",
    "kunne", "skal", "skulle", "vil", "ville", "må", "måtte",
    "en", "et", "år", "og", "i", "på", "med", "som", "til", "for", "af", "der",
    "men", "eller", "hvis", "når", "også", "ikke", "kun", "bare", "så",
    "her", "nu", "op", "ned", "ud", "ind", "om", "over", "under",
    "case", "elev", "barn", "barnet", "eleven", "dreng", "pige",
  ];
  const stopwords = new Set(stopwordList.map((word) => normalizeSemantic(word)));

  const searchTerms = Array.from(terms).filter(
    (term) => term.length >= 2 && !stopwords.has(term)
  );

  const requestedAge = extractRequestedCaseAge(searchText);
  const requestedGender = extractRequestedCaseGender(searchText);

  const getFields = (caseItem) => ({
    id: normalizeSemantic(caseItem.id),
    title: normalizeSemantic(caseItem.titel || caseItem.title),
    age: normalizeCaseAge(caseItem.alder || caseItem.age),
    gender: inferCaseGender(caseItem),
    theme: normalizeSemantic(
      semanticSafeText(
        caseItem.tema || caseItem.theme || caseItem.kategori
      )
    ),
    diagnoses: normalizeSemanticArray(
      caseItem.diagnoser ||
        caseItem.diagnoses ||
        caseItem.relevante_diagnoser
    ),
    environment: normalizeSemantic(
      semanticSafeText(
        caseItem.miljø || caseItem.contexts || caseItem.kontekst
      )
    ),
    behavior: normalizeSemantic(
      semanticSafeText(
        caseItem.adfærd ||
          caseItem.problem ||
          caseItem.kort_beskrivelse ||
          caseItem.description ||
          caseItem.beskrivelse
      )
    ),
    triggers: normalizeSemantic(
      semanticSafeText(
        caseItem.triggers || caseItem.trigger || caseItem.udløsere
      )
    ),
    childPerspective: normalizeSemantic(
      semanticSafeText(
        caseItem.barnets_oplevelse || caseItem.barnets_perspektiv || caseItem.childVoice
      )
    ),
    solution: normalizeSemantic(
      semanticSafeText(
        caseItem.løsning ||
          caseItem.tiltag ||
          caseItem.cda_guiding ||
          caseItem.værktøjer ||
          caseItem.solution ||
          caseItem.tools
      )
    ),
  });

  const scoreCase = (caseItem) => {
    const fields = getFields(caseItem);
    let score = 0;
    const matchedTerms = new Set();

    for (const term of searchTerms) {
      if (!term) continue;

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

      if (fields.diagnoses.some((diagnosis) => diagnosis === term)) {
        score += 80;
        termMatched = true;
      } else if (
        fields.diagnoses.some((diagnosis) => diagnosis.includes(term))
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

      if (termMatched) matchedTerms.add(term);
    }

    // 23B.9H: Alder er en bløddig tiebreaker, ikke en dominerende faktor.
    // Indhold (adfærd, tema, triggers, diagnose) skal afgøre matchet;
    // alder må kun udslagsgivende, når to cases ellers er indholdsmæssigt lige gode.
    if (requestedAge !== null) {
      if (fields.age !== null) {
        const ageDiff = Math.abs(fields.age - requestedAge);

        if (ageDiff === 0) {
          score += 50;
          matchedTerms.add(`${requestedAge} år`);
        } else if (ageDiff === 1) {
          score += 20;
        } else if (ageDiff === 2) {
          score += 0;
        } else {
          score -= 20;
        }
      } else {
        score -= 10;
      }
    }

    if (requestedGender) {
      if (fields.gender === requestedGender) {
        score += 80;
        matchedTerms.add(requestedGender === "female" ? "pige" : "dreng");
      } else if (fields.gender && fields.gender !== requestedGender) {
        score -= 40;
      }
    }

    if (matchedTerms.size > 1) {
      score += matchedTerms.size * 8;
    }

    return {
      score,
      matchedTerms: Array.from(matchedTerms),
    };
  };

  const matches = Array.from(uniqueCases.values())
    .map((caseItem) => ({
      caseItem,
      scoreData: scoreCase(caseItem),
    }))
    .filter((item) => item.scoreData.score > 0)
    .sort((a, b) => b.scoreData.score - a.scoreData.score)
    .slice(0, 5)
    .map(({ caseItem, scoreData }) => ({
      id: caseItem.id || null,
      titel: caseItem.titel || caseItem.title || null,
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
    }));

  return {
    success: true,
    query: searchText,
    terms_used: searchTerms,
    total_unique_cases: uniqueCases.size,
    total_returned: matches.length,
    results: matches,
  };
}

function isOtherExperienceCaseRequest(message) {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    "hvad gjorde andre",
    "hvad har andre gjort",
    "hvad gjorde en anden",
    "hvad gjorde andre lærere",
    "hvad gjorde en anden lærer",
    "har andre prøvet",
    "har en anden prøvet",
    "har andre lærere prøvet",
    "har en anden lærer prøvet",
    "er der andre der har prøvet",
    "er der en lærer der har prøvet"
  ];

  return patterns.some((pattern) => text.includes(pattern));
}

function getRichestCaseById(caseId) {
  const normalizedId = String(caseId || "").toLowerCase().trim();

  if (!normalizedId) return null;

  const casesDir = path.join(
    process.cwd(),
    "public",
    "CDA",
    "cases"
  );

  if (!fs.existsSync(casesDir)) return null;

  const candidates = [];
  const files = fs
    .readdirSync(casesDir)
    .filter(
      (file) =>
        file.toLowerCase().endsWith(".json") &&
        !file.toLowerCase().includes("index")
    );

  for (const file of files) {
    const parsed = readJsonFile(
      path.join(casesDir, file),
      `Casefil kunne ikke læses: ${file}`
    );

    const fileCases = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.cases)
        ? parsed.cases
        : [];

    for (const item of fileCases) {
      if (String(item.id || "").toLowerCase().trim() === normalizedId) {
        candidates.push(item);
      }
    }
  }

  if (candidates.length === 0) return null;

  const richnessScore = (item) =>
    [
      item.problem,
      item.løsning,
      item.tiltag,
      item.resultat,
      item.refleksion,
      item.barnets_oplevelse,
    ].reduce(
      (total, value) => total + String(value || "").trim().length,
      0
    );

  return candidates.sort(
    (a, b) => richnessScore(b) - richnessScore(a)
  )[0];
}


function getAllRichestLocalCases() {
  const casesDir = path.join(
    process.cwd(),
    "public",
    "CDA",
    "cases"
  );

  if (!fs.existsSync(casesDir)) return [];

  const byId = new Map();
  const files = fs
    .readdirSync(casesDir)
    .filter(
      (file) =>
        file.toLowerCase().endsWith(".json") &&
        !file.toLowerCase().includes("index")
    );

  const richnessScore = (item) =>
    [
      item.problem,
      item.løsning,
      item.tiltag,
      item.resultat,
      item.refleksion,
      item.barnets_oplevelse,
    ].reduce(
      (total, value) => total + String(value || "").trim().length,
      0
    );

  for (const file of files) {
    const parsed = readJsonFile(
      path.join(casesDir, file),
      `Casefil kunne ikke læses: ${file}`
    );

    const fileCases = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.cases)
        ? parsed.cases
        : [];

    for (const item of fileCases) {
      const id = String(item.id || "").toLowerCase().trim();
      if (!id) continue;

      const existing = byId.get(id);
      if (!existing || richnessScore(item) > richnessScore(existing)) {
        byId.set(id, item);
      }
    }
  }

  return Array.from(byId.values());
}

function getActiveLocalCaseFromContext(activeCaseContext) {
  if (!hasActiveCaseContext(activeCaseContext)) return null;

  const contextText = [
    activeCaseContext.summary,
    activeCaseContext.known_context,
    activeCaseContext.last_user_message,
    activeCaseContext.last_heidi_reply,
    activeCaseContext.last_guidance_summary,
    ...(Array.isArray(activeCaseContext.used_data_sources)
      ? activeCaseContext.used_data_sources
      : []),
  ].filter(Boolean).join("\n");

  const idMatch = contextText.match(/\bcase-[a-z0-9-]+\b/i);
  if (idMatch?.[0]) {
    const byId = getRichestCaseById(idMatch[0]);
    if (byId) return byId;
  }

  const allCases = getAllRichestLocalCases();
  const titleCandidates = [];
  const boldMatches = [...String(contextText || "").matchAll(/\*\*([^*]{3,120})\*\*/g)];

  for (const match of boldMatches) {
    const value = String(match?.[1] || "").trim();
    if (!value) continue;
    if (/^(problem|tema|barnets oplevelse|typisk fejl|løsning|loesning|tiltag|resultat|refleksion|tilbage)/i.test(value)) continue;
    titleCandidates.push(value);
  }

  for (const line of String(contextText || "").split(/\n+/)) {
    const cleaned = line.replace(/^#+\s*/, "").replace(/^[-–|\s]+/, "").trim();
    if (cleaned.length >= 4 && cleaned.length <= 120) titleCandidates.push(cleaned);
  }

  const normalizedCandidates = new Set(
    titleCandidates.map((candidate) => normalizeDiagnosisPhrase(candidate)).filter(Boolean)
  );

  for (const caseItem of allCases) {
    const title = normalizeDiagnosisPhrase(caseItem.titel || caseItem.title || "");
    if (title && normalizedCandidates.has(title)) return caseItem;
  }

  const lastCaseSearch = String(activeCaseContext.last_user_message || "").trim();
  if (lastCaseSearch && isDirectLocalCaseRequest(lastCaseSearch)) {
    const reconstructed = findBestDirectLocalCase(lastCaseSearch);
    if (reconstructed?.caseData) return reconstructed.caseData;
  }

  return null;
}

function resolveActiveLocalCase(pendingAction, activeCaseContext) {
  return getActiveLocalCaseFromSession(pendingAction) || getActiveLocalCaseFromContext(activeCaseContext);
}

function isLikelyFreeTextCaseMessage(value) {
  const original = String(value || "").trim();
  const text = normalizeDiagnosisPhrase(original);

  if (original.length < 120 || !text) {
    return false;
  }

  if (isDirectLocalCaseRequest(original)) {
    return false;
  }

  const personMarkers = [
    "jeg har",
    "vi har",
    "barn",
    "dreng",
    "pige",
    "elev",
    "klasse",
    "bornehave",
    "skole",
    "foralder",
    "foraelder",
  ];

  const challengeMarkers = [
    "hvad kan det skyldes",
    "hvad kan jeg",
    "hvad kan vi",
    "tavs",
    "uro",
    "driller",
    "konflikt",
    "vred",
    "laaser",
    "laser",
    "overgang",
    "skift",
    "frikvarter",
    "mave",
    "fremlaeg",
    "aflever",
    "hente",
    "hjemme",
  ];

  const hasPersonMarker = personMarkers.some((marker) => text.includes(marker));
  const hasChallengeMarker = challengeMarkers.some((marker) => text.includes(marker));

  return hasPersonMarker && hasChallengeMarker;
}

function shouldPreferActiveCaseContextForSpecialist(activeCaseContext) {
  if (!hasActiveCaseContext(activeCaseContext)) {
    return false;
  }

  return isLikelyFreeTextCaseMessage(activeCaseContext.last_user_message);
}

function resolveActiveLocalCaseForSpecialistRequest(pendingAction, activeCaseContext) {
  const contextCase = getActiveLocalCaseFromContext(activeCaseContext);

  if (shouldPreferActiveCaseContextForSpecialist(activeCaseContext)) {
    return contextCase;
  }

  return getActiveLocalCaseFromSession(pendingAction) || contextCase;
}

function getPendingActionForSpecialistResponse(activeLocalCase, activeCaseContext, fallbackPendingAction) {
  if (activeLocalCase?.id) {
    return `local_case:${activeLocalCase.id}`;
  }

  if (shouldPreferActiveCaseContextForSpecialist(activeCaseContext)) {
    return null;
  }

  return fallbackPendingAction || null;
}



function findBestOtherExperienceCase(message) {
  const searchResult = getSemanticSearch({ search: message });
  const bestMatch = searchResult?.results?.[0];

  if (!bestMatch?.id || Number(bestMatch.score || 0) <= 0) {
    return null;
  }

  const fullCase = getRichestCaseById(bestMatch.id);

  if (!fullCase) return null;

  return {
    id: fullCase.id || null,
    titel: fullCase.titel || fullCase.title || null,
    alder: fullCase.alder || fullCase.age || null,
    problem: fullCase.problem || fullCase.kort_beskrivelse || null,
    løsning: fullCase.løsning || null,
    tiltag: fullCase.tiltag || null,
    resultat: fullCase.resultat || null,
    score: bestMatch.score,
    matched_terms: bestMatch.matched_terms || [],
  };
}

function isDirectLocalCaseRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  const directPatterns = [
    "case",
    "vis case",
    "vis en case",
    "find case",
    "find en case",
    "har du en case",
    "har du en case om",
    "case om",
    "case omkring",
    "case med",
    "case adhd",
    "case autisme",
    "case angst",
  ];

  if (text === "case") return true;

  return directPatterns.some((pattern) => {
    const normalizedPattern = normalizeDiagnosisPhrase(pattern);
    return text.startsWith(normalizedPattern) || text.includes(` ${normalizedPattern} `);
  });
}

function extractLocalCaseSearchText(message) {
  let text = normalizeDiagnosisPhrase(message);

  const removablePhrases = [
    "kan du vise mig",
    "vis mig",
    "vis en",
    "vis",
    "find en",
    "find",
    "har du en",
    "har du",
    "jeg vil se en",
    "jeg vil gerne se en",
    "case omkring",
    "case om",
    "case med",
    "case",
    "lignende",
  ];

  for (const phrase of removablePhrases) {
    const normalizedPhrase = normalizeDiagnosisPhrase(phrase);
    text = text
      .replace(new RegExp(`\\b${normalizedPhrase}\\b`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return text || normalizeDiagnosisPhrase(message);
}

function findBestDirectLocalCase(message) {
  const searchText = extractLocalCaseSearchText(message);
  const searchResult = getSemanticSearch({ search: searchText });
  const bestMatch = searchResult?.results?.[0];

  if (!bestMatch?.id || Number(bestMatch.score || 0) <= 0) {
    return {
      searchText,
      searchResult,
      caseData: null,
      bestMatch: null,
    };
  }

  return {
    searchText,
    searchResult,
    bestMatch,
    caseData: getRichestCaseById(bestMatch.id),
  };
}

function formatLocalCaseValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "").trim();
}

function buildDirectLocalCaseReply(caseData, bestMatch, searchText) {
  const title = formatLocalCaseValue(caseData.titel || caseData.title || caseData.id || "Case");
  const lines = [`**${title}**`];

  const meta = [];
  const age = formatLocalCaseValue(caseData.alder || caseData.age);
  const diagnoses = formatLocalCaseValue(
    caseData.diagnoser || caseData.diagnoses || caseData.relevante_diagnoser
  );
  const environment = formatLocalCaseValue(
    caseData.miljø || caseData.contexts || caseData.kontekst
  );

  if (age) meta.push(`${age} år`);
  if (diagnoses) meta.push(diagnoses);
  if (environment) meta.push(environment);
  if (meta.length > 0) lines.push(meta.join(" · "));

  const theme = formatLocalCaseValue(caseData.tema || caseData.theme || caseData.kategori);
  if (theme) lines.push("", `**Tema:** ${theme}`);

  const sections = [
    ["Problem", caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse],
    ["Barnets oplevelse", caseData.barnets_oplevelse || caseData.barnets_perspektiv],
    ["Typisk fejl", caseData.typisk_fejl],
    ["Løsning", caseData.løsning || caseData.loesning],
    ["Tiltag", caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer],
    ["Resultat", caseData.resultat],
    ["Refleksion", caseData.refleksion],
  ];

  for (const [heading, value] of sections) {
    const text = formatLocalCaseValue(value);
    if (text) lines.push("", `**${heading}**`, text);
  }

  lines.push(
    "",
    "**Du kan skrive:** næste, forrige, ny case, hvad gjorde læreren?, hvad oplevede barnet?, hvad gik typisk galt?, PPR."
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}


function getLocalCaseSessionId(pendingAction) {
  const value = String(pendingAction || "").trim();

  if (value.startsWith("local_case_nav:")) {
    try {
      const parsed = JSON.parse(decodeURIComponent(value.slice("local_case_nav:".length)));
      return parsed?.id || null;
    } catch (error) {
      return null;
    }
  }

  if (!value.startsWith("local_case:")) {
    return null;
  }

  return value.split(":").slice(1).join(":").trim() || null;
}

function encodeLocalCaseNavState(state = {}) {
  const safeState = {
    id: state.id || null,
    searchText: state.searchText || "",
    ids: Array.isArray(state.ids) ? state.ids.filter(Boolean).slice(0, 5) : [],
    index: Number.isFinite(Number(state.index)) ? Number(state.index) : 0,
  };

  try {
    return `local_case_nav:${encodeURIComponent(JSON.stringify(safeState))}`;
  } catch (error) {
    return safeState.id ? `local_case:${safeState.id}` : null;
  }
}

function decodeLocalCaseNavState(pendingAction) {
  const value = String(pendingAction || "").trim();

  if (!value.startsWith("local_case_nav:")) {
    const caseId = getLocalCaseSessionId(value);
    return caseId
      ? {
          id: caseId,
          searchText: "",
          ids: [caseId],
          index: 0,
        }
      : null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice("local_case_nav:".length)));
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter(Boolean).slice(0, 5) : [];
    const id = parsed?.id || ids[0] || null;
    const index = Math.max(0, Math.min(Number(parsed?.index || 0), Math.max(ids.length - 1, 0)));

    return id
      ? {
          id,
          searchText: String(parsed?.searchText || ""),
          ids: ids.length ? ids : [id],
          index,
        }
      : null;
  } catch (error) {
    return null;
  }
}

function buildLocalCaseNavState(caseData, searchText, searchResult, index = 0) {
  const ids = Array.isArray(searchResult?.results)
    ? searchResult.results.map((item) => item?.id).filter(Boolean).slice(0, 5)
    : [];

  const caseId = caseData?.id || ids[index] || null;
  const normalizedIds = ids.includes(caseId) ? ids : [caseId, ...ids].filter(Boolean).slice(0, 5);
  const safeIndex = Math.max(0, normalizedIds.indexOf(caseId));

  return {
    id: caseId,
    searchText: searchText || "",
    ids: normalizedIds,
    index: safeIndex,
  };
}

function getActiveLocalCaseFromSession(pendingAction) {
  const state = decodeLocalCaseNavState(pendingAction);
  return state?.id ? getRichestCaseById(state.id) : null;
}

function preserveActiveLocalCasePendingAction(activeLocalCase, pendingAction) {
  if (!activeLocalCase?.id) {
    return pendingAction || null;
  }

  const current = String(pendingAction || "").trim();

  if (current.startsWith("local_case_nav:") || current.startsWith("local_case:")) {
    return pendingAction;
  }

  return `local_case:${activeLocalCase.id}`;
}

function isReturnToActiveCaseRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  return [
    "tilbage til case",
    "tilbage til casen",
    "ga tilbage til case",
    "gå tilbage til case",
    "ga tilbage til casen",
    "gå tilbage til casen",
    "vis casen igen",
    "vis mig casen igen",
    "vis den case igen",
    "vis samme case igen",
    "samme case igen",
    "vis aktiv case",
    "vis aktive case",
    "vis den aktive case",
    "vis den aktive case igen",
    "hent aktiv case",
    "hent den aktive case",
    "aktiv case",
    "tilbage til sagen",
    "vis sagen igen",
  ].some((pattern) => text === normalizeDiagnosisPhrase(pattern));
}

function buildReturnToActiveCaseReply(activeLocalCase, activeCaseContext = null) {
  if (activeLocalCase) {
    return buildDirectLocalCaseReply(activeLocalCase, null, "");
  }

  if (hasActiveCaseContext(activeCaseContext)) {
    const lines = [
      "**Tilbage til den aktive sag**",
      activeCaseContext.summary || activeCaseContext.known_context || activeCaseContext.last_user_message || "Den aktive sag er stadig åben.",
      "",
      "Du kan skrive: lav dagsplan, vis observationslog, PPR, eller fortsætte med samme elev.",
    ];

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return "Ingen aktiv case fundet. Skriv fx: case ADHD dreng 10 år koncentrationsproblemer.";
}

function isLocalCaseNavigationRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  return [
    "naeste",
    "næste",
    "neste",
    "forrige",
    "tilbage",
    "ny case",
    "anden case",
    "find en anden case",
    "vis en anden case",
  ].some((pattern) => text === normalizeDiagnosisPhrase(pattern));
}

function getLocalCaseNavigationDirection(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (text === "forrige" || text === "tilbage") {
    return -1;
  }

  return 1;
}

function buildLocalCaseNavigationResult(pendingAction, message) {
  const state = decodeLocalCaseNavState(pendingAction);

  if (!state || !Array.isArray(state.ids) || state.ids.length <= 1) {
    return {
      caseData: null,
      pendingAction,
      reply: "Ingen flere cases i denne søgning.",
      index: state?.index || 0,
      total: state?.ids?.length || 0,
    };
  }

  const direction = getLocalCaseNavigationDirection(message);
  const nextIndex = state.index + direction;

  if (nextIndex < 0 || nextIndex >= state.ids.length) {
    return {
      caseData: null,
      pendingAction,
      reply: direction > 0 ? "Ingen flere cases i denne søgning." : "Du er ved første case i denne søgning.",
      index: state.index,
      total: state.ids.length,
    };
  }

  const caseId = state.ids[nextIndex];
  const caseData = getRichestCaseById(caseId);
  const nextState = {
    ...state,
    id: caseId,
    index: nextIndex,
  };

  if (!caseData) {
    return {
      caseData: null,
      pendingAction: encodeLocalCaseNavState(nextState),
      reply: "Ingen data",
      index: nextIndex,
      total: state.ids.length,
    };
  }

  return {
    caseData,
    pendingAction: encodeLocalCaseNavState(nextState),
    reply: buildDirectLocalCaseReply(caseData, null, state.searchText),
    index: nextIndex,
    total: state.ids.length,
  };
}


function isLocalCaseFollowupRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  const patterns = [
    "hvad gjorde laereren",
    "hvad gjorde læreren",
    "hvad gjorde den voksne",
    "hvad gjorde de voksne",
    "hvad var problemet",
    "problem",
    "barnets oplevelse",
    "hvad oplevede barnet",
    "hvordan oplevede barnet",
    "barnets stemme",
    "typisk fejl",
    "hvad gik galt",
    "fejl",
    "loesning",
    "løsning",
    "hvad var loesningen",
    "hvad var løsningen",
    "tiltag",
    "hvad kan man goere",
    "hvad kan man gøre",
    "hvad blev resultatet",
    "hvad skete bagefter",
    "skete der bagefter",
    "bagefter",
    "resultat",
    "refleksion",
    "hvad kan jeg laere",
    "hvad kan jeg lære",
    "hvad kan vi laere",
    "hvad kan vi lære",
    "uddyb",
    "forklar mere",
    "kort",
    "kort fortalt",
  ];

  return patterns.some((pattern) => {
    const normalizedPattern = normalizeDiagnosisPhrase(pattern);
    return text === normalizedPattern || text.includes(normalizedPattern);
  });
}

function buildLocalCaseFieldBlock(heading, value) {
  const text = formatLocalCaseValue(value);
  return text ? `${heading}\n${text}` : "";
}

function buildActiveLocalCaseFollowupReply(caseData, message) {
  const text = normalizeDiagnosisPhrase(message);
  const title = formatLocalCaseValue(caseData.titel || caseData.title || caseData.id || "Aktiv case");
  const lines = [`**${title}**`];
  let addedLocalData = false;

  const add = (heading, value) => {
    const block = buildLocalCaseFieldBlock(heading, value);
    if (!block) {
      return false;
    }

    lines.push("", block);
    addedLocalData = true;
    return true;
  };

  const problem = caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse;
  const childExperience = caseData.barnets_oplevelse || caseData.barnets_perspektiv || caseData.childVoice;
  const typicalMistake = caseData.typisk_fejl || caseData.mistakes;
  const solution = caseData.løsning || caseData.loesning || caseData.solution;
  const actions = caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer || caseData.tools;
  const result = caseData.resultat || caseData.result;
  const reflection = caseData.refleksion || caseData.reflection;

  if (text.includes("problem")) {
    add("Problem", problem);
  } else if (text.includes("barnets") || text.includes("oplevede") || text.includes("stemme")) {
    add("Barnets oplevelse", childExperience);
  } else if (text.includes("fejl") || text.includes("gik galt")) {
    add("Typisk fejl", typicalMistake);
  } else if (text.includes("resultat") || text.includes("bagefter")) {
    add("Resultat", result);
  } else if (
    text.includes("laereren") ||
    text.includes("læreren") ||
    text.includes("voksne") ||
    text.includes("voksen") ||
    text.includes("loesning") ||
    text.includes("løsning") ||
    text.includes("tiltag") ||
    text.includes("goere") ||
    text.includes("gøre")
  ) {
    add("Løsning", solution);
    add("Tiltag", actions);
  } else if (text.includes("refleksion") || text.includes("laere") || text.includes("lære")) {
    add("Refleksion", reflection);
  } else if (text.includes("kort")) {
    add("Kort om casen", problem);
    add("Løsning", solution);
  } else {
    add("Problem", problem);
    add("Barnets oplevelse", childExperience);
    add("Typisk fejl", typicalMistake);
    add("Løsning", solution);
    add("Tiltag", actions);
    add("Resultat", result);
    add("Refleksion", reflection);
  }

  if (!addedLocalData) {
    lines.push("", "Ingen data");
  }

  lines.push(
    "",
    "**Du kan skrive:** næste, forrige, ny case, hvad gjorde læreren?, hvad oplevede barnet?, hvad gik typisk galt?, PPR."
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildLocalCaseSpecialistContextBlock(caseData) {
  if (!caseData) {
    return "";
  }

  const title = formatLocalCaseValue(caseData.titel || caseData.title || caseData.id || "Aktiv case");
  const lines = [
    "AKTIV LOKAL CASE",
    "Denne case er valgt fra den lokale CDA-casebank. Brug den som konkret grundlag for specialistvinklen. Stil ikke diagnose, giv ikke medicinråd, og opfind ikke manglende casefelter.",
    `case_id: ${formatLocalCaseValue(caseData.id) || "-"}`,
    `titel: ${title}`,
  ];

  const fields = [
    ["alder", caseData.alder || caseData.age],
    ["diagnoser_i_casen", caseData.diagnoser || caseData.diagnoses || caseData.relevante_diagnoser],
    ["miljø", caseData.miljø || caseData.contexts || caseData.kontekst],
    ["tema", caseData.tema || caseData.theme || caseData.kategori],
    ["problem", caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse],
    ["barnets_oplevelse", caseData.barnets_oplevelse || caseData.barnets_perspektiv || caseData.childVoice],
    ["typisk_fejl", caseData.typisk_fejl || caseData.mistakes],
    ["løsning", caseData.løsning || caseData.loesning || caseData.solution],
    ["tiltag", caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer || caseData.tools],
    ["resultat", caseData.resultat || caseData.result],
    ["refleksion", caseData.refleksion || caseData.reflection],
  ];

  for (const [label, value] of fields) {
    const text = formatLocalCaseValue(value);
    if (text) {
      lines.push(`${label}: ${text}`);
    }
  }

  return lines.join("\n");
}

export {
  buildActiveLocalCaseFollowupReply,
  buildDirectLocalCaseReply,
  buildLocalCaseNavigationResult,
  buildLocalCaseNavState,
  buildReturnToActiveCaseReply,
  decodeLocalCaseNavState,
  encodeLocalCaseNavState,
  findBestDirectLocalCase,
  findBestOtherExperienceCase,
  formatLocalCaseValue,
  getActiveLocalCaseFromSession,
  getAllRichestLocalCases,
  getPendingActionForSpecialistResponse,
  getRichestCaseById,
  getSemanticSearch,
  isDirectLocalCaseRequest,
  isLocalCaseFollowupRequest,
  isLocalCaseNavigationRequest,
  isOtherExperienceCaseRequest,
  isReturnToActiveCaseRequest,
  preserveActiveLocalCasePendingAction,
  resolveActiveLocalCase,
  resolveActiveLocalCaseForSpecialistRequest,
  shouldPreferActiveCaseContextForSpecialist,
};
