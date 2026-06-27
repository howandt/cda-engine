import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { routeBornehaveInput } from "../lib/bornehaveRouter.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

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

function readHeidiPrompt() {
  const promptPath = path.join(process.cwd(), "CDA_HeidiPrompt.md");

  const heidiPrompt = readTextFile(
    promptPath,
    "CDA_HeidiPrompt.md blev ikke fundet"
  );

  const rulesPath = path.join(
    process.cwd(),
    "data",
    "prompt_rules.json"
  );

  const rulesData = readJsonFile(
    rulesPath,
    "data/prompt_rules.json blev ikke fundet"
  );

  const responseStyleRules =
    rulesData?.system_rules?.response_style_rules || {};

  const modeSwitchRules =
    rulesData?.system_rules?.mode_switch_rules || {};

  return [
    heidiPrompt,
    "",
    "CENTRALE DYNAMISKE SYSTEMREGLER",
"Disse regler er allerede indlæst. Kald ikke getPromptRules for response_style_rules eller mode_switch_rules.",
"I normal drift må 'Det kan du gøre nu' højst indeholde 3 konkrete handlinger.",
"",
"response_style_rules:",
    JSON.stringify(responseStyleRules, null, 2),
    "",
    "mode_switch_rules:",
    JSON.stringify(modeSwitchRules, null, 2),
  ].join("\n");
}

function getPromptRules(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "prompt_rules.json"
  );

  const data = readJsonFile(
    filePath,
    "data/prompt_rules.json blev ikke fundet"
  );

  const section = args.section?.trim();

  if (!section) {
    return data;
  }

  const sectionData = data?.system_rules?.[section];

  if (!sectionData) {
    return {
      error: `Sektion ikke fundet: ${section}`,
    };
  }

  return {
    section,
    data: sectionData,
  };
}

function normalizeSearchWord(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]/g, "");
}

function levenshteinDistance(a, b) {
  const first = normalizeSearchWord(a);
  const second = normalizeSearchWord(b);

  const matrix = Array.from(
    { length: second.length + 1 },
    () => Array(first.length + 1).fill(0)
  );

  for (let i = 0; i <= second.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= first.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= second.length; i += 1) {
    for (let j = 1; j <= first.length; j += 1) {
      const cost = second[i - 1] === first[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[second.length][first.length];
}

function searchWordMatches(searchWord, textWord) {
  const search = normalizeSearchWord(searchWord);
  const text = normalizeSearchWord(textWord);

  if (!search || !text) {
    return false;
  }

  if (text.includes(search) || search.includes(text)) {
    return true;
  }

  const shortestLength = Math.min(search.length, text.length);

  for (let length = shortestLength; length >= 4; length -= 1) {
    const searchStart = search.slice(0, length);
    const textStart = text.slice(0, length);

    if (searchStart === textStart) {
      return true;
    }
  }

  if (search.length >= 5 && text.length >= 5) {
    return levenshteinDistance(search, text) <= 2;
  }

  return false;
}

function getPblProjects(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_PBL_Projects.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_PBL_Projects.json blev ikke fundet"
  );

  let projects = Array.isArray(data.projects)
    ? [...data.projects]
    : [];

  if (args.id) {
    const project = projects.find(
      (item) => String(item.id || "") === String(args.id)
    );

    if (!project) {
      return {
        error: `PBL-projekt ikke fundet: ${args.id}`,
      };
    }

    return {
      version: data.version || null,
      project,
    };
  }

  let directInterestMatch = false;

if (args.search) {
  const searchTerms = String(args.search)
    .split(/\s+/)
    .map((term) => normalizeSearchWord(term))
    .filter(Boolean);

  const interestMatches = projects.filter((project) => {
    const searchableWords = [
      project.title,
      project.subtitle,
      project.description,
      ...(project.activities || []),
      ...(project.competencies || []),
      ...(project.career_alignment || []),
    ]
      .filter(Boolean)
      .join(" ")
      .split(/\s+/)
      .map((word) => normalizeSearchWord(word))
      .filter(Boolean);

    return searchTerms.every((searchTerm) =>
      searchableWords.some((textWord) =>
        searchWordMatches(searchTerm, textWord)
      )
    );
  });

  if (interestMatches.length > 0) {
    projects = interestMatches;
    directInterestMatch = true;
  }
}

if (directInterestMatch) {
  return {
    version: data.version || null,
    filtered_count: projects.length,
    direct_interest_match: true,
    projects,
  };
}

  if (args.diagnosis) {
    const diagnosisTerms = String(args.diagnosis)
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    projects = projects.filter((project) =>
      diagnosisTerms.some((term) =>
        (project.diagnosis_match || []).some((item) =>
          String(item).toLowerCase().includes(term)
        )
      )
    );
  }

  if (args.level) {
    projects = projects.filter(
      (project) =>
        String(project.level || "").toLowerCase() ===
        String(args.level).toLowerCase()
    );
  }

  if (args.social) {
    projects = projects.filter(
      (project) =>
        String(project.social_exposure || "").toLowerCase() ===
        String(args.social).toLowerCase()
    );
  }

  if (args.structure) {
    projects = projects.filter(
      (project) =>
        String(project.structure_need || "").toLowerCase() ===
        String(args.structure).toLowerCase()
    );
  }

  if (args.stimuli) {
    const stimuliTerms = String(args.stimuli)
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    projects = projects.filter((project) =>
      stimuliTerms.some((term) =>
        (project.stimuli_type || []).some((item) =>
          String(item).toLowerCase().includes(term)
        )
      )
    );
  }

  return {
    version: data.version || null,
    filtered_count: projects.length,
    projects,
  };
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getCases(args = {}) {
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

  let cases = [];

  for (const file of files) {
    const filePath = path.join(casesDir, file);
    const parsed = readJsonFile(
      filePath,
      `Casefil kunne ikke læses: ${file}`
    );

    const fileCases = Array.isArray(parsed)
      ? parsed
      : parsed.cases || [];

    cases = cases.concat(fileCases);
  }

  if (args.id) {
    const match = cases.find(
      (item) =>
        safeString(item.id).toLowerCase() ===
        safeString(args.id).toLowerCase()
    );

    return match
      ? { total: 1, data: match }
      : { error: `Ingen case fundet med ID: ${args.id}` };
  }

  if (args.tema) {
    const query = safeString(args.tema).toLowerCase();

    cases = cases.filter((item) =>
      safeString(item.tema).toLowerCase().includes(query)
    );
  }

  if (args.diagnose) {
    const query = safeString(args.diagnose).toLowerCase();

    cases = cases.filter(
      (item) =>
        Array.isArray(item.diagnoser) &&
        item.diagnoser.some((diagnose) =>
          safeString(diagnose).toLowerCase().includes(query)
        )
    );
  }

  if (args.kategori) {
    const query = safeString(args.kategori).toLowerCase();

    cases = cases.filter((item) =>
      safeString(item.kategori).toLowerCase().includes(query)
    );
  }

  if (args.search) {
    const query = safeString(args.search).toLowerCase();

    cases = cases.filter((item) =>
      [
        item.id,
        item.titel,
        item.tema,
        item.problem,
        item.barnets_oplevelse,
        item.typisk_fejl,
        item.løsning,
        item.tiltag,
        item.værktøjer,
        item.kategori,
        item.kort_beskrivelse,
        item.diagnoser,
        item.miljø,
      ].some((value) =>
        safeString(value).toLowerCase().includes(query)
      )
    );
  }

  return {
    total: cases.length,
    data: cases,
  };
}

function getBornehaveRouting(args = {}) {
  return routeBornehaveInput({
    text: args.text || "",
    age: args.age ? Number(args.age) : null,
    category: args.category || "",
    tags: Array.isArray(args.tags) ? args.tags : [],
  });
}

function getDiagnoser(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_Diagnoser.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_Diagnoser.json blev ikke fundet"
  );

  const diagnoser = Array.isArray(data.diagnoser)
    ? [...data.diagnoser]
    : [];

  if (args.id) {
    const diagnose = diagnoser.find(
      (item) =>
        String(item.id || "").toLowerCase() ===
        String(args.id).toLowerCase()
    );

    return diagnose
      ? {
          version: data.version || null,
          diagnose,
        }
      : {
          error: `Diagnose ikke fundet: ${args.id}`,
        };
  }

  let filteredDiagnoser = diagnoser;

  if (args.kategori) {
    filteredDiagnoser = filteredDiagnoser.filter((item) =>
      String(item.kategori || "")
        .toLowerCase()
        .includes(String(args.kategori).toLowerCase())
    );
  }

  if (args.komorbiditet) {
    filteredDiagnoser = filteredDiagnoser.filter(
      (item) =>
        Array.isArray(item.komorbiditet_links) &&
        item.komorbiditet_links.some((link) =>
          String(link)
            .toLowerCase()
            .includes(String(args.komorbiditet).toLowerCase())
        )
    );
  }

  if (args.search) {
    const query = String(args.search).trim().toLowerCase();

    const scoreDiagnose = (item) => {
      let score = 0;

      const id = String(item.id || "").toLowerCase();
      const navn = String(item.navn || "").toLowerCase();
      const fuldNavn = String(item.fuld_navn || "").toLowerCase();
      const kategori = String(item.kategori || "").toLowerCase();

      if (id === query) score += 100;
      else if (id.includes(query)) score += 40;

      if (navn === query) score += 90;
      else if (navn.includes(query)) score += 35;

      if (fuldNavn === query) score += 80;
      else if (fuldNavn.includes(query)) score += 25;

      if (
        Array.isArray(item.noegleord) &&
        item.noegleord.some(
          (word) => String(word).toLowerCase() === query
        )
      ) {
        score += 20;
      } else if (
        Array.isArray(item.noegleord) &&
        item.noegleord.some((word) =>
          String(word).toLowerCase().includes(query)
        )
      ) {
        score += 10;
      }

      if (kategori === query) score += 8;
      else if (kategori.includes(query)) score += 3;

      return score;
    };

    filteredDiagnoser = filteredDiagnoser
      .map((item) => ({
        ...item,
        _score: scoreDiagnose(item),
      }))
      .filter((item) => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...item }) => item);
  }

  return {
    version: data.version || null,
    total_diagnoser: diagnoser.length,
    filtered_count: filteredDiagnoser.length,
    diagnoser: filteredDiagnoser.map((item) => ({
      id: item.id || null,
      navn: item.navn || null,
      fuld_navn: item.fuld_navn || null,
      kategori: item.kategori || null,
      praevalens: item.praevalens || null,
      sidst_opdateret: item.sidst_opdateret || null,
    })),
  };
}

function analyzeEmotion(text, data) {
  let score = 0;
  const textLower = String(text || "").toLowerCase();

  const foundWords = {
    positive: [],
    negative: [],
    empathy: [],
    commands: [],
    validating: [],
  };

  const wordCategories = data.word_categories || {};

  if (wordCategories.positive?.words) {
    wordCategories.positive.words.forEach((word) => {
      if (textLower.includes(String(word).toLowerCase())) {
        score += Number(wordCategories.positive.score_value || 0);
        foundWords.positive.push(word);
      }
    });
  }

  if (wordCategories.negative?.words) {
    wordCategories.negative.words.forEach((word) => {
      if (textLower.includes(String(word).toLowerCase())) {
        score += Number(wordCategories.negative.score_value || 0);
        foundWords.negative.push(word);
      }
    });
  }

  if (wordCategories.empathy?.phrases) {
    wordCategories.empathy.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.empathy.score_value || 0);
        foundWords.empathy.push(phrase);
      }
    });
  }

  if (wordCategories.commands?.phrases) {
    wordCategories.commands.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.commands.score_value || 0);
        foundWords.commands.push(phrase);
      }
    });
  }

  if (wordCategories.validating?.phrases) {
    wordCategories.validating.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.validating.score_value || 0);
        foundWords.validating.push(phrase);
      }
    });
  }

  let mood = "neutral";
  let moodData = data.mood_levels?.neutral || {};

  if (score >= 3) {
    mood = "støttende";
    moodData = data.mood_levels?.støttende || {};
  } else if (score >= 1) {
    mood = "rolig";
    moodData = data.mood_levels?.rolig || {};
  } else if (score <= -2) {
    mood = "pres";
    moodData = data.mood_levels?.pres || {};
  } else if (score < 0) {
    mood = "spændt";
    moodData = data.mood_levels?.spændt || {};
  }

  return {
    score,
    mood,
    emoji: moodData.emoji || null,
    description: moodData.description || null,
    effect_on_child: moodData.effect_on_child || null,
    characteristics: moodData.characteristics || [],
    found_elements: foundWords,
    word_count: {
      positive: foundWords.positive.length,
      negative: foundWords.negative.length,
      empathy: foundWords.empathy.length,
      commands: foundWords.commands.length,
      validating: foundWords.validating.length,
    },
  };
}
function getEmotionAnalysis(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_Emotionengine.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_Emotionengine.json blev ikke fundet"
  );

  const text = String(args.text || "");

  if (!text) {
    return {
      error: "Tekst mangler",
    };
  }

  return {
    input: {
      text,
      context: args.context || null,
    },
    analysis: analyzeEmotion(text, data),
    communication_tips: data.communication_tips || [],
  };
}
function getKomorbiditet(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_Komorbiditet.json"
  );

  const rawData = readJsonFile(
    filePath,
    "data/CDA_Komorbiditet.json blev ikke fundet"
  );

  const komorbiditetData = rawData.komorbiditet_data || [];

  const normalize = (value) =>
    String(value || "").trim().toLowerCase();

  const primary = normalize(args.primary);
  const id = normalize(args.id);
  const trigger = normalize(args.trigger);

  if (id) {
    for (const diagnosis of komorbiditetData) {
      const match = (diagnosis.comorbidities || []).find(
        (item) => normalize(item.id) === id
      );

      if (match) {
        return {
          type: "comorbidity",
          data: match,
        };
      }
    }

    return {
      error: `Komorbiditet ikke fundet: ${args.id}`,
    };
  }

  if (primary && trigger) {
    const primaryMatch = komorbiditetData.find(
      (item) =>
        normalize(item.primary_diagnosis) === primary ||
        normalize(item.id) === primary
    );

    if (!primaryMatch) {
      return {
        error: `Primær diagnose ikke fundet: ${args.primary}`,
      };
    }

    const matches = (primaryMatch.comorbidities || []).filter((item) =>
      (item.trigger_tegn || []).some((tegn) =>
        normalize(tegn).includes(trigger)
      )
    );

    return {
      type: "trigger_search",
      primary_diagnosis: primaryMatch.primary_diagnosis,
      trigger: args.trigger,
      count: matches.length,
      data: matches,
    };
  }

  if (primary) {
    const match = komorbiditetData.find(
      (item) =>
        normalize(item.primary_diagnosis) === primary ||
        normalize(item.id) === primary
    );

    return match
      ? {
          type: "primary_diagnosis",
          data: match,
        }
      : {
          error: `Primær diagnose ikke fundet: ${args.primary}`,
        };
  }

  return {
    type: "all",
    count: komorbiditetData.length,
    data: komorbiditetData,
  };
}
function getRollespil(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "rollespil_scenarier.json"
  );

  const data = readJsonFile(
    filePath,
    "data/rollespil_scenarier.json blev ikke fundet"
  );

  const scenarios = Array.isArray(data)
    ? data
    : data.scenarier || data.data || [];

  if (args.caseId) {
    const scenario = scenarios.find(
      (item) =>
        String(item.id || "") === String(args.caseId)
    );

    return scenario
      ? {
          success: true,
          source: "local",
          data: scenario,
        }
      : {
          success: false,
          error: `Rollespilscase ikke fundet: ${args.caseId}`,
          available_cases: scenarios
            .map((item) => item.id)
            .filter(Boolean),
        };
  }

  return {
    success: true,
    source: "local",
    total: scenarios.length,
    data: scenarios,
  };
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

  const searchTerms = Array.from(terms).filter(
    (term) => term.length >= 2
  );

  const getFields = (caseItem) => ({
    id: normalizeSemantic(caseItem.id),
    title: normalizeSemantic(caseItem.titel || caseItem.title),
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
        caseItem.barnets_oplevelse || caseItem.barnets_perspektiv
      )
    ),
    solution: normalizeSemantic(
      semanticSafeText(
        caseItem.løsning ||
          caseItem.tiltag ||
          caseItem.cda_guiding ||
          caseItem.værktøjer
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
function getSpecialistPanel() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_SpecialistPanel.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_SpecialistPanel.json blev ikke fundet"
  );

  return {
    success: true,
    source: "local",
    data,
  };
}
function getTemplates(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_Templates.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_Templates.json blev ikke fundet"
  );

  const templateDatabase = data.template_database || data;

  const templates = Array.isArray(templateDatabase.templates)
    ? templateDatabase.templates
    : [];

  const metadata = templateDatabase.metadata || {};

  const searchIndex =
    templateDatabase.search_index ||
    data.search_index ||
    {};

  if (args.type === "index") {
    return {
      success: true,
      source: "local",
      data: searchIndex,
    };
  }

  return {
    success: true,
    source: "local",
    templates,
    metadata,
    total: templates.length,
  };
}

const tools = [
  {
    type: "function",
    name: "getPromptRules",
    description:
      "Henter dynamiske prompt-regler til CDA. Bruges ved behov for styrende systemregler, mode-styring, rollespil, konfliktflow eller anden CDA-logik.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Valgfri sektion, fx comorbidity_rules, practice_situations eller conflict_mediator_rules.",
        },
      },
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "getPblProjects",
    description:
      "Henter og matcher PBL-projekter fra CDA. Brug ved elevinteresser, praktiske styrker, uro, kort koncentration, lav motivation eller behov for aktivering.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description:
            "Direkte elevinteresse eller fritekstsøgning, fx cykel, dyr, Minecraft eller træarbejde.",
        },
        diagnosis: {
          type: "string",
          description:
            "Diagnosefilter, fx ADHD, autisme eller DCD.",
        },
        level: {
          type: "string",
          description:
            "Projektets niveau, fx Junior, Intermediate eller Advanced.",
        },
        social: {
          type: "string",
          description:
            "Social belastning, fx Lav, Moderat eller Gruppe.",
        },
        structure: {
          type: "string",
          description:
            "Behov for struktur, fx Lav, Moderat eller Høj.",
        },
        stimuli: {
          type: "string",
          description:
            "Foretrukken stimulustype, fx Taktil, Visuel eller Kinæstetisk.",
        },
        id: {
          type: "string",
          description:
            "Hent et bestemt PBL-projekt via projekt-id.",
        },
      },
      additionalProperties: false,
    },
    strict: false,
  },
  {
  type: "function",
  name: "getCases",
  description:
    "Henter eksisterende CDA-cases. Brug ved forespørgsler om cases, træningscases, konkrete skolesituationer, diagnoser, temaer eller kategorier.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Hent en bestemt case via case-id.",
      },
      search: {
        type: "string",
        description:
          "Fritekstsøgning i casebiblioteket, fx uro, konflikt, skolevægring eller gruppearbejde.",
      },
      tema: {
        type: "string",
        description: "Filtrér cases efter tema.",
      },
      diagnose: {
        type: "string",
        description: "Filtrér cases efter diagnose.",
      },
      kategori: {
        type: "string",
        description: "Filtrér cases efter kategori.",
      },
    },
    additionalProperties: false,
  },
    strict: false,
},
{
  type: "function",
  name: "getBornehaveRouting",
  description:
    "Henter eksisterende CDA-børnehaverouting. Brug ved børn i børnehave, observation, adfærd, overlevering til skole eller valg af børnehaveskabelon.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Beskrivelse af barnet eller situationen.",
      },
      age: {
        type: "number",
        description: "Barnets alder.",
      },
      category: {
        type: "string",
        description: "Valgfri kategori.",
      },
      tags: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Valgfrie observationstags.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getDiagnoser",
  description:
    "Henter eksisterende CDA-diagnosedata. Brug ved spørgsmål om diagnoser, symptombilleder, kategorier eller komorbiditet.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Hent en bestemt diagnose via diagnose-id.",
      },
      search: {
        type: "string",
        description:
          "Søg efter diagnose via navn, fuldt navn, nøgleord eller kategori.",
      },
      kategori: {
        type: "string",
        description: "Filtrér diagnoser efter kategori.",
      },
      komorbiditet: {
        type: "string",
        description:
          "Filtrér diagnoser efter kobling til en mulig komorbiditet.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getEmotionAnalysis",
  description:
    "Analyserer eksisterende CDA-kommunikation for tone, pres, empati, validering og kommandoer.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Den tekst eller formulering, der skal analyseres.",
      },
      context: {
        type: "string",
        description: "Valgfri kontekst for kommunikationen.",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getKomorbiditet",
  description:
    "Henter eksisterende CDA-komorbiditetsdata. Brug ved spørgsmål om mulig komorbiditet, primær diagnose eller konkrete triggertegn.",
  parameters: {
    type: "object",
    properties: {
      primary: {
        type: "string",
        description:
          "Primær diagnose, fx ADHD eller autisme.",
      },
      id: {
        type: "string",
        description:
          "Hent en bestemt komorbiditet via id.",
      },
      trigger: {
        type: "string",
        description:
          "Søg efter komorbiditet ud fra et konkret triggertegn.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getRollespil",
  description:
    "Henter eksisterende CDA-rollespilsscenarier. Kald altid dette værktøj, når brugeren beder om rollespil, en liste over eksisterende rollespilsscenarier, perspektivskifte, træning eller et bestemt scenarie. Uden caseId returneres hele listen.",
  parameters: {
    type: "object",
    properties: {
      caseId: {
        type: "string",
        description:
          "Hent et bestemt rollespilsscenarie via case-id.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getSemanticSearch",
  description:
    "Søger semantisk i det eksisterende CDA-casearkiv og skelner mellem primær diagnose, komorbid diagnose og tekstmatch.",
  parameters: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Søgetekst, diagnose, tema eller problemstilling.",
      },
    },
    required: ["search"],
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getSpecialistPanel",
  description:
    "Henter det eksisterende CDA-specialistpanel. Brug ved behov for specialistperspektiver, tværfaglig vurdering eller råd fra specialistpanelet.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getTemplates",
  description:
    "Henter eksisterende CDA-skabeloner og søgeindeks. Brug ved forespørgsler om skabeloner, rapporter, skole-hjem-kommunikation, møder eller overlevering.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Brug værdien index for kun at hente skabelonernes søgeindeks.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
];

function executeTool(toolCall) {
  try {
    const args = JSON.parse(toolCall.arguments || "{}");

    if (toolCall.name === "getPromptRules") {
      return getPromptRules(args);
    }

    if (toolCall.name === "getPblProjects") {
      return getPblProjects(args);
    }

    if (toolCall.name === "getCases") {
  return getCases(args);
}

if (toolCall.name === "getBornehaveRouting") {
  return getBornehaveRouting(args);
}

if (toolCall.name === "getDiagnoser") {
  return getDiagnoser(args);
}

if (toolCall.name === "getEmotionAnalysis") {
  return getEmotionAnalysis(args);
}

if (toolCall.name === "getKomorbiditet") {
  return getKomorbiditet(args);
}

if (toolCall.name === "getRollespil") {
  return getRollespil(args);
}

if (toolCall.name === "getSemanticSearch") {
  return getSemanticSearch(args);
}

if (toolCall.name === "getSpecialistPanel") {
  return getSpecialistPanel();
}

if (toolCall.name === "getTemplates") {
  return getTemplates(args);
}

    return {
      error: `Ukendt funktion: ${toolCall.name}`,
    };
  } catch (error) {
    return {
      error: "Funktionen kunne ikke udføres",
      details: error.message,
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY mangler",
    });
  }

  const {
  message,
  response_style = "Mellem",
  adgangskode,
} = req.body || {};

if (!message || typeof message !== "string") {
  return res.status(400).json({
    error: "Feltet message mangler",
  });
}

const allowedResponseStyles = ["Kort", "Mellem", "Dyb"];

if (!allowedResponseStyles.includes(response_style)) {
  return res.status(400).json({
    error: "response_style skal være Kort, Mellem eller Dyb",
  });
}

try {
  const heidiPrompt = readHeidiPrompt();

  const runtimeInstructions = [
    heidiPrompt,
    "",
    `AKTUEL SVARSTIL: ${response_style}`,
    response_style === "Kort"
      ? "Svar meget kort og direkte."
      : response_style === "Dyb"
        ? "Forklar også hvorfor, faglige sammenhænge og begrundelser, men behold den relevante CDA-struktur."
        : "Giv en kort forklaring og konkrete næste skridt.",
  ].join("\n");

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  const usageByCall = [];

  function addUsage(responseData, callNumber, phase, toolNames = []) {
    const callInputTokens = Number(
      responseData?.usage?.input_tokens || 0
    );

    const callOutputTokens = Number(
      responseData?.usage?.output_tokens || 0
    );

    const callTotalTokens = Number(
      responseData?.usage?.total_tokens ||
        callInputTokens + callOutputTokens
    );

    inputTokens += callInputTokens;
    outputTokens += callOutputTokens;
    totalTokens += callTotalTokens;

    usageByCall.push({
      call: callNumber,
      phase,
      tools_returned_to_model: toolNames,
      input_tokens: callInputTokens,
      output_tokens: callOutputTokens,
      total_tokens: callTotalTokens,
    });
  }

  let response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions: runtimeInstructions,
    input: message,
    tools,
    max_output_tokens: 1200,
  });

  addUsage(response, 1, "initial");

  const usedTools = [];
  const toolDebug = [];

  for (let round = 0; round < 3; round += 1) {
    const toolCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (toolCalls.length === 0) {
      break;
    }

    const toolOutputs = toolCalls.map((toolCall) => {
      const parsedArguments = JSON.parse(
        toolCall.arguments || "{}"
      );

      usedTools.push(toolCall.name);

      toolDebug.push({
        name: toolCall.name,
        arguments: parsedArguments,
      });

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(executeTool(toolCall)),
      };
    });

    response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: runtimeInstructions,
      previous_response_id: response.id,
      input: toolOutputs,
      tools,
      max_output_tokens: 1200,
    });

    addUsage(
      response,
      round + 2,
      "after_tool_output",
      toolCalls.map((toolCall) => toolCall.name)
    );
  }

  console.log("CDA tokenmåling pr. OpenAI-kald:", {
    usage_by_call: usageByCall,
    totals: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    },
  });

  if (adgangskode) {
    const supabase = getSupabase();

    const { error: forbrugsFejl } = await supabase
      .from("token_forbrug")
      .insert({
        adgangskode: adgangskode.trim().toUpperCase(),
        system: "cda",
        udbyder: "openai",
        model: "gpt-5.4-mini",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        samlet_tokens: totalTokens,
      });

    if (forbrugsFejl) {
      console.error(
        "Kunne ikke gemme tokenforbrug:",
        forbrugsFejl
      );
    }
  }

  return res.status(200).json({
  success: true,
  reply: response.output_text,
  model: "gpt-5.4-mini",
  tools_used: usedTools,
  tool_debug: toolDebug,
});
} catch (error) {
  console.error("CDA chatfejl:", error);

  return res.status(500).json({
    success: false,
    error: "CDA kunne ikke behandle beskeden",
    details: error.message,
  });
}
}