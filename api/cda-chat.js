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

  const sourcePriorityRules =
    rulesData?.system_rules?.source_priority_rules || {};

  const generalRule = rulesData?.system_rules?.general_rule || "";

  const practiceSituations =
    rulesData?.system_rules?.practice_situations || {};

  return [
    heidiPrompt,
    "",
    "CENTRALE DYNAMISKE SYSTEMREGLER",
"Disse regler er allerede indlæst. Kald ikke getPromptRules for response_style_rules, mode_switch_rules, source_priority_rules, general_rule eller practice_situations.",
"I normal drift må 'Det kan du gøre nu' højst indeholde 3 konkrete handlinger.",
"",
"response_style_rules:",
    JSON.stringify(responseStyleRules, null, 2),
    "",
    "mode_switch_rules:",
    JSON.stringify(modeSwitchRules, null, 2),
    "",
    "general_rule:",
    generalRule,
    "",
    "source_priority_rules:",
    JSON.stringify(sourcePriorityRules, null, 2),
    "",
    "practice_situations:",
    JSON.stringify(practiceSituations, null, 2),
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


const STRUCTURED_DIAGNOSIS_ALIASES = {
  adfaerd_og_impulskontrol: [
    "adfaerd og impulskontrol",
    "adfaerdsforstyrrelse",
    "adfaerdsforstyrrelser",
    "impulskontrolforstyrrelse",
    "impulskontrolforstyrrelser",
    "conduct disorder",
    "impulse control disorder",
  ],
  adhd: ["adhd", "attention deficit hyperactivity disorder"],
  afhaengighedslidelser: [
    "afhaengighedslidelse",
    "afhaengighedslidelser",
    "afhaengighed",
    "addiction disorder",
    "addiction disorders",
  ],
  angst: [
    "angst",
    "angstlidelse",
    "angstlidelser",
    "anxiety",
    "anxiety disorder",
    "anxiety disorders",
  ],
  antisocial: [
    "antisocial personlighedsforstyrrelse",
    "antisociale moenstre",
    "antisocial personality disorder",
    "antisocial",
  ],
  arfid: [
    "arfid",
    "avoidant restrictive food intake disorder",
    "undgaaende restriktiv spiseforstyrrelse",
  ],
  autisme: [
    "autisme",
    "autismespektrum",
    "autismespektrumforstyrrelse",
    "autism",
    "autism spectrum",
    "asd",
  ],
  bipolar: [
    "bipolar",
    "bipolar lidelse",
    "bipolar disorder",
    "maniodepressiv",
  ],
  borderline: [
    "borderline",
    "emotionelt ustabil personlighedsforstyrrelse",
    "borderline personality disorder",
  ],
  did: [
    "dissociativ identitetsforstyrrelse",
    "dissociative identity disorder",
  ],
  kommunikationsforstyrrelser: [
    "kommunikationsforstyrrelse",
    "kommunikationsforstyrrelser",
    "communication disorder",
    "communication disorders",
  ],
  laeringsvanskeligheder: [
    "laeringsvanskelighed",
    "laeringsvanskeligheder",
    "indlaeringsvanskelighed",
    "indlaeringsvanskeligheder",
    "learning disability",
    "learning disabilities",
    "learning disorder",
    "learning disorders",
  ],
  narcissisme: [
    "narcissisme",
    "narcissistisk personlighedsforstyrrelse",
    "narcissism",
    "narcissistic personality disorder",
  ],
  ocd: [
    "ocd",
    "tvangslidelse",
    "tvangstanker og tvangshandlinger",
    "obsessive compulsive disorder",
  ],
  odd: [
    "oppositionel trodsforstyrrelse",
    "oppositional defiant disorder",
  ],
  ptsd: [
    "ptsd",
    "posttraumatisk stresslidelse",
    "post traumatic stress disorder",
  ],
  selektiv_mutisme: [
    "selektiv mutisme",
    "selective mutism",
  ],
  skizofreni: ["skizofreni", "schizophrenia"],
  soevnforstyrrelser: [
    "soevnforstyrrelse",
    "soevnforstyrrelser",
    "sleep disorder",
    "sleep disorders",
  ],
  spiseforstyrrelser: [
    "spiseforstyrrelse",
    "spiseforstyrrelser",
    "eating disorder",
    "eating disorders",
  ],
  tics_tourettes: [
    "tics",
    "tic lidelse",
    "tic lidelser",
    "tourette",
    "tourettes",
    "tourette syndrom",
    "tourette syndrome",
  ],
  tilknytningsforstyrrelser: [
    "tilknytningsforstyrrelse",
    "tilknytningsforstyrrelser",
    "attachment disorder",
    "attachment disorders",
  ],
};

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

function getStructuredDiagnosisIndex() {
  const indexPath = path.join(
    process.cwd(),
    "data",
    "diagnoser",
    "index.json"
  );

  const indexData = readJsonFile(
    indexPath,
    "data/diagnoser/index.json blev ikke fundet"
  );

  return Array.isArray(indexData) ? indexData : [];
}

function loadStructuredDiagnosis(meta) {
  if (!meta?.fil) {
    return null;
  }

  const filePath = path.join(
    process.cwd(),
    "data",
    "diagnoser",
    meta.fil
  );

  return readJsonFile(
    filePath,
    `Struktureret diagnosefil blev ikke fundet: ${meta.fil}`
  );
}

function findStructuredDiagnosisMatches(message) {
  const originalText = String(message || "");
  const normalizedText = normalizeDiagnosisPhrase(originalText);
  const indexData = getStructuredDiagnosisIndex();
  const matches = [];

  for (const meta of indexData) {
    const id = String(meta?.id || "");

    if (id === "did") {
      const hasDidAbbreviation = /\bDID\b/.test(originalText);
      const hasDidName = (STRUCTURED_DIAGNOSIS_ALIASES.did || []).some(
        (alias) => containsDiagnosisPhrase(normalizedText, alias)
      );

      if (!hasDidAbbreviation && !hasDidName) {
        continue;
      }
    } else if (id === "odd") {
      const hasOddAbbreviation = /\bODD\b/.test(originalText);
      const hasOddName = (STRUCTURED_DIAGNOSIS_ALIASES.odd || []).some(
        (alias) => containsDiagnosisPhrase(normalizedText, alias)
      );

      if (!hasOddAbbreviation && !hasOddName) {
        continue;
      }
    } else {
      const candidates = [
        meta.id,
        meta.navn,
        String(meta.fil || "").replace(/\.json$/i, ""),
        ...(STRUCTURED_DIAGNOSIS_ALIASES[id] || []),
      ];

      if (
        !candidates.some((candidate) =>
          containsDiagnosisPhrase(normalizedText, candidate)
        )
      ) {
        continue;
      }
    }

    matches.push(meta);
  }

  return matches;
}

function isReservedSpecializedRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  const reservedPatterns = [
    "vis en case",
    "find en case",
    "case om",
    "case med",
    "pbl",
    "projektbaseret laering",
    "lav et projekt",
    "find et projekt",
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "rollespil",
    "rolleleg",
    "perspektivskifte",
    "lav et skema",
    "lav en skabelon",
    "vis en skabelon",
    "handleplan",
    "stotteplan",
    "komorbiditet",
    "komorbid",
    "overlap mellem",
    "kan der vaere andet end",
    "kan der vare andet end",
    "bornehaveoverlevering",
    "overlevering til skole",
  ];

  return reservedPatterns.some((pattern) => text.includes(pattern));
}

function getSingleStructuredDiagnosisMatch(message) {
  if (isReservedSpecializedRequest(message)) {
    return null;
  }

  const matches = findStructuredDiagnosisMatches(message);

  return matches.length === 1 ? matches[0] : null;
}

function diagnosisKeyMatches(key, patterns) {
  const normalizedKey = normalizeDiagnosisPhrase(key);
  return patterns.some((pattern) => normalizedKey.includes(pattern));
}

function getDiagnosisIntent(message, role) {
  const text = normalizeDiagnosisPhrase(message);
  const includesAny = (phrases) =>
    phrases.some((phrase) => text.includes(normalizeDiagnosisPhrase(phrase)));

  return {
    definition: includesAny([
      "hvad er",
      "forklar",
      "definition",
      "what is",
      "explain",
    ]),
    symptoms: includesAny([
      "symptom",
      "tegn",
      "viser sig",
      "kendetegn",
      "opmaerksom pa",
      "manifest",
    ]),
    school:
      role === "Lærer" ||
      (role !== "Forælder" &&
        includesAny([
          "skole",
          "elev",
          "undervisning",
          "klasse",
          "laering",
          "laerer",
          "school",
          "student",
          "teaching",
          "classroom",
        ])),
    home:
      role === "Forælder" ||
      includesAny([
        "hjem",
        "familie",
        "foraelder",
        "home",
        "family",
        "parent",
      ]),
    assessment: includesAny([
      "udredning",
      "diagnoseproces",
      "vurdering",
      "test",
      "diagnostic",
      "assessment",
    ]),
    causes: includesAny([
      "aarsag",
      "hvorfor",
      "risikofaktor",
      "cause",
      "risk factor",
    ]),
    support: includesAny([
      "behandling",
      "hjaelp",
      "stoette",
      "tiltag",
      "strategi",
      "hvad kan",
      "treatment",
      "support",
      "strategy",
    ]),
    myths: includesAny([
      "myte",
      "misforstaa",
      "myth",
      "misunderstand",
    ]),
    life: includesAny([
      "barndom",
      "ungdom",
      "voksen",
      "livsstadie",
      "gennem livet",
      "childhood",
      "teen",
      "adult",
      "life stage",
    ]),
    acute: includesAny([
      "akut",
      "fare",
      "selvskade",
      "suicid",
      "acute",
      "danger",
      "self harm",
    ]),
    social: includesAny([
      "social",
      "venner",
      "venskab",
      "relation",
      "friends",
      "relationship",
    ]),
  };
}

function scoreDiagnosisSection(key, message, role, intent) {
  const normalizedKey = normalizeDiagnosisPhrase(key);
  const messageWords = new Set(
    normalizeDiagnosisPhrase(message)
      .split(" ")
      .filter((word) => word.length >= 4)
  );

  let score = normalizedKey === "intro" ? 1 : 0;

  for (const word of normalizedKey.split(" ")) {
    if (word.length >= 4 && messageWords.has(word)) {
      score += 3;
    }
  }

  const groups = {
    definition: [
      "intro",
      "hvad er",
      "hvad taler",
      "definition",
      "centrale",
      "typiske",
      "kendetegn",
      "hovedomraader",
    ],
    symptoms: [
      "symptom",
      "kendetegn",
      "viser sig",
      "ser ud",
      "hverdagen",
      "centrale",
      "traek",
    ],
    school: [
      "skole",
      "laering",
      "barnet i skolen",
      "dit barn i skolen",
      "skolelivet",
    ],
    home: [
      "hjem",
      "familie",
      "foraeldre",
      "sociale relationer",
      "socialt og hjemme",
    ],
    assessment: ["diagnose", "vurdering", "udredning", "dsm"],
    causes: [
      "aarsag",
      "hvorfor",
      "risiko",
      "saarbarhed",
      "neurobiologi",
    ],
    support: ["behandling", "hjaelp", "stoette", "ressourcer"],
    myths: ["myter", "misforstaa", "tolket forkert", "laest forkert"],
    life: [
      "liv",
      "udvikling",
      "forloeb",
      "prognose",
      "barndom",
      "ungdom",
      "voksen",
    ],
    acute: ["akut"],
    social: ["social", "relation", "venner", "hverdagen"],
  };

  for (const [intentName, patterns] of Object.entries(groups)) {
    if (intent[intentName] && diagnosisKeyMatches(normalizedKey, patterns)) {
      score += 6;
    }
  }

  if (role === "Lærer" && diagnosisKeyMatches(normalizedKey, groups.school)) {
    score += 5;
  }

  if (role === "Forælder" && diagnosisKeyMatches(normalizedKey, groups.home)) {
    score += 5;
  }

  if (
    role === "Specialist" &&
    diagnosisKeyMatches(normalizedKey, [
      ...groups.definition,
      ...groups.symptoms,
      ...groups.assessment,
      "komorbid",
    ])
  ) {
    score += 3;
  }

  return score;
}

function findBestDiagnosisSectionKey(entries, patterns, excludedKeys) {
  const match = entries.find(
    ([key]) =>
      !excludedKeys.has(key) && diagnosisKeyMatches(key, patterns)
  );

  return match ? match[0] : null;
}

function buildStructuredDiagnosisContext(entry, message, role) {
  const shortView = entry?.kort_visning || {};
  const longView = entry?.lang_visning || {};
  const intent = getDiagnosisIntent(message, role);
  const selectedShort = {
    hvad_er_det: shortView.hvad_er_det || null,
    hvordan_viser_det_sig: shortView.hvordan_viser_det_sig || null,
    hvad_misforstaas_ofte: shortView.hvad_misforstaas_ofte || null,
  };

  if (role !== "Specialist" || intent.support) {
    selectedShort.hvad_kan_den_voksne_gore =
      shortView.hvad_kan_den_voksne_gore || null;
  }

  const entries = Object.entries(longView)
    .map(([key, value]) => ({
      key,
      value,
      score: scoreDiagnosisSection(key, message, role, intent),
    }))
    .sort((a, b) => b.score - a.score);

  const rawEntries = Object.entries(longView);
  const requiredKeys = [];
  const usedKeys = new Set();

  const addRequiredKey = (patterns) => {
    const key = findBestDiagnosisSectionKey(
      rawEntries,
      patterns,
      usedKeys
    );

    if (key) {
      requiredKeys.push(key);
      usedKeys.add(key);
    }
  };

  if (intent.definition) {
    addRequiredKey([
      "hvad er",
      "hvad taler",
      "definition",
      "intro",
      "hovedomraader",
    ]);
  }

  if (intent.school) {
    addRequiredKey([
      "skole",
      "laering",
      "barnet i skolen",
      "dit barn i skolen",
      "skolelivet",
    ]);
  }

  if (intent.home) {
    addRequiredKey([
      "hjem",
      "familie",
      "foraeldre",
      "sociale relationer",
      "socialt og hjemme",
    ]);
  }

  if (intent.assessment || role === "Specialist") {
    addRequiredKey(["diagnose", "vurdering", "udredning", "dsm"]);
  }

  if (intent.causes) {
    addRequiredKey([
      "aarsag",
      "hvorfor",
      "risiko",
      "saarbarhed",
      "neurobiologi",
    ]);
  }

  if (intent.support) {
    addRequiredKey(["behandling", "hjaelp", "stoette"]);
  }

  if (intent.myths) {
    addRequiredKey(["myter", "misforstaa", "tolket forkert"]);
  }

  if (intent.life) {
    addRequiredKey([
      "liv",
      "udvikling",
      "forloeb",
      "prognose",
      "barndom",
      "ungdom",
      "voksen",
    ]);
  }

  if (intent.acute) {
    addRequiredKey(["akut"]);
  }

  if (intent.social) {
    addRequiredKey(["social", "relation", "hverdagen"]);
  }

  const maxSections = role === "Specialist" ? 4 : 3;
  const maxCharacters = role === "Specialist" ? 6800 : 5600;
  const selectedKeys = [];

  for (const key of requiredKeys) {
    if (!selectedKeys.includes(key)) {
      selectedKeys.push(key);
    }
  }

  for (const item of entries) {
    if (selectedKeys.length >= maxSections) {
      break;
    }

    if (!selectedKeys.includes(item.key)) {
      selectedKeys.push(item.key);
    }
  }

  const selectedLong = {};
  const contextBase = {
    id: entry?.id || null,
    navn: entry?.navn || null,
    fuld_navn: entry?.fuld_navn || null,
    kort_visning: selectedShort,
    relevante_fagafsnit: selectedLong,
  };

  for (const key of selectedKeys) {
    const nextLong = {
      ...selectedLong,
      [key]: longView[key],
    };

    const nextContext = {
      ...contextBase,
      relevante_fagafsnit: nextLong,
    };

    if (JSON.stringify(nextContext).length <= maxCharacters) {
      selectedLong[key] = longView[key];
    }
  }

  return {
    context: contextBase,
    selectedSections: Object.keys(selectedLong),
  };
}


function isLocalDiagnosisTheoryRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  const theoryMarkers = [
    "teori",
    "diagnose information",
    "diagnoseinformation",
    "diagnose info",
    "diagnoseinfo",
    "diagnose oplysninger",
    "diagnoseoplysninger",
    "information om",
    "info om",
    "forklar diagnose",
    "hvad er",
  ];

  return theoryMarkers.some((marker) =>
    text.includes(normalizeDiagnosisPhrase(marker))
  );
}


function getStructuredDiagnosisMetaById(id) {
  const normalizedId = normalizeDiagnosisPhrase(id);
  if (!normalizedId) {
    return null;
  }

  return (
    getStructuredDiagnosisIndex().find((meta) => {
      const candidates = [
        meta?.id,
        meta?.navn,
        String(meta?.fil || "").replace(/\.json$/i, ""),
      ]
        .map((value) => normalizeDiagnosisPhrase(value))
        .filter(Boolean);

      return candidates.includes(normalizedId);
    }) || null
  );
}

function getLocalDiagnosisSessionMeta(pendingAction) {
  const value = String(pendingAction || "").trim();

  if (!value.startsWith("local_diagnosis_theory:")) {
    return null;
  }

  const id = value.split(":").slice(1).join(":").trim();
  return getStructuredDiagnosisMetaById(id);
}

function isLocalDiagnosisTheoryFollowup(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  return [
    "dyb",
    "dybdegaaende",
    "uddyb",
    "uddybende",
    "kort",
    "kortere",
    "kort svar",
    "teori",
    "diagnose information",
    "diagnoseinfo",
    "hvad er",
  ].some((marker) => text === normalizeDiagnosisPhrase(marker) || text.includes(normalizeDiagnosisPhrase(marker)));
}

function isLocalDiagnosisStop(message) {
  const text = normalizeDiagnosisPhrase(message);
  return ["stop", "afslut", "tilbage"].includes(text);
}

function buildLocalDiagnosisSessionPrompt(meta, message) {
  const diagnosisName = meta?.navn || meta?.id || "diagnose";
  return `${diagnosisName} teori ${message}`;
}

function toLocalTextLines(value, depth = 0) {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? [text] : [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toLocalTextLines(item, depth + 1))
      .filter(Boolean);
  }

  if (typeof value === "object") {
    const lines = [];

    for (const [key, item] of Object.entries(value)) {
      const childLines = toLocalTextLines(item, depth + 1);

      if (childLines.length === 0) {
        continue;
      }

      if (depth <= 1) {
        const label = String(key || "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
        lines.push(label);
      }

      lines.push(...childLines);
    }

    return lines;
  }

  return [];
}

function formatLocalDiagnosisBlock(title, value, bullet = false) {
  const lines = toLocalTextLines(value);

  if (lines.length === 0) {
    return "";
  }

  return [
    title,
    ...lines.map((line) => (bullet ? `- ${line}` : line)),
  ].join("\n");
}

function getLocalDiagnosisTheoryIntent(message, responseStyle) {
  const text = normalizeDiagnosisPhrase(message);
  const includesAny = (phrases) =>
    phrases.some((phrase) => text.includes(normalizeDiagnosisPhrase(phrase)));

  const wantsDeep =
    responseStyle === "Dyb" ||
    includesAny(["dyb", "dybdegaaende", "uddyb", "grundig"]);

  if (includesAny(["teori", "lokal teori"])) {
    return wantsDeep ? "theory_deep" : "theory";
  }

  if (
    includesAny([
      "diagnose information",
      "diagnoseinformation",
      "diagnose info",
      "diagnoseinfo",
      "diagnose oplysninger",
      "diagnoseoplysninger",
      "information om",
      "info om",
    ])
  ) {
    return wantsDeep ? "diagnosis_info_deep" : "diagnosis_info";
  }

  if (includesAny(["hvad er", "forklar", "definition", "what is", "explain"])) {
    return wantsDeep ? "definition_deep" : "definition";
  }

  return wantsDeep ? "theory_deep" : "theory";
}

function takeLocalTextLines(value, limit = 5) {
  return toLocalTextLines(value).slice(0, limit);
}

function formatLimitedLocalDiagnosisBlock(title, value, bullet = false, limit = 5) {
  const lines = takeLocalTextLines(value, limit);

  if (lines.length === 0) {
    return "";
  }

  return [
    title,
    ...lines.map((line) => (bullet ? `- ${line}` : line)),
  ].join("\n");
}

function findLongDiagnosisValue(longView, patterns, usedKeys = new Set()) {
  const entries = Object.entries(longView || {});
  const match = entries.find(
    ([key]) => !usedKeys.has(key) && diagnosisKeyMatches(key, patterns)
  );

  if (!match) {
    return null;
  }

  usedKeys.add(match[0]);
  return {
    key: match[0],
    value: match[1],
  };
}

function pushPreferredLongBlock(blocks, longView, title, patterns, usedKeys, bullet = false, limit = 10) {
  const match = findLongDiagnosisValue(longView, patterns, usedKeys);

  if (!match) {
    return false;
  }

  const block = formatLimitedLocalDiagnosisBlock(title, match.value, bullet, limit);

  if (!block) {
    return false;
  }

  blocks.push(block, "");
  return true;
}

function buildLocalDiagnosisTheoryReply(entry, message, role, responseStyle) {
  const shortView = entry?.kort_visning || {};
  const longView = entry?.lang_visning || {};
  const localIntent = getLocalDiagnosisTheoryIntent(message, responseStyle);
  const wantsDeep = localIntent.endsWith("_deep");

  const title = entry?.navn || entry?.fuld_navn || entry?.id || "Diagnose";
  const audienceLine =
    role === "Specialist"
      ? "Fagligt niveau: specialist — præcist, datanært og uden diagnosekonklusion på enkeltsag."
      : role === "Forælder"
        ? "Fagligt niveau: forælder — roligt, konkret og hverdagsnært."
        : "Fagligt niveau: lærer — praksisnært, direkte og anvendeligt i morgen.";

  const blocks = [String(title).toUpperCase(), audienceLine, ""];

  if (localIntent.startsWith("definition")) {
    const what = formatLimitedLocalDiagnosisBlock(
      "Kort forklaring",
      shortView.hvad_er_det || entry?.hvad_er_det || entry?.beskrivelse,
      false,
      wantsDeep ? 5 : 2
    );
    if (what) blocks.push(what, "");

    const signs = formatLimitedLocalDiagnosisBlock(
      "I hverdagen kan det fx ses som",
      shortView.hvordan_viser_det_sig || entry?.hvordan_viser_det_sig || entry?.tegn,
      true,
      wantsDeep ? 6 : 3
    );
    if (signs) blocks.push(signs, "");

    const adult = formatLimitedLocalDiagnosisBlock(
      role === "Forælder" ? "Det hjælper ofte at" : "I praksis hjælper det ofte at",
      shortView.hvad_kan_den_voksne_gore || entry?.hvad_kan_den_voksne_gore,
      true,
      wantsDeep ? 6 : 3
    );
    if (adult) blocks.push(adult, "");

    blocks.push(
      "Kort sagt: Se vanskeligheden som et støttebehov, ikke som dovenskab eller dårlig vilje."
    );

    return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (localIntent.startsWith("diagnosis_info")) {
    const usedKeys = new Set();

    const what = formatLocalDiagnosisBlock(
      "Hvad er det?",
      shortView.hvad_er_det || entry?.hvad_er_det || entry?.beskrivelse,
      false
    );
    if (what) blocks.push(what, "");

    pushPreferredLongBlock(
      blocks,
      longView,
      "Definition og typiske symptomer",
      ["definition", "typiske symptomer", "symptom", "kendetegn", "hovedomraader"],
      usedKeys,
      false,
      wantsDeep ? 18 : 10
    );

    if (!wantsDeep) {
      const signs = formatLimitedLocalDiagnosisBlock(
        "Typisk ser man fx",
        shortView.hvordan_viser_det_sig || entry?.hvordan_viser_det_sig || entry?.tegn,
        true,
        5
      );
      if (signs) blocks.push(signs, "");
    }

    pushPreferredLongBlock(
      blocks,
      longView,
      "Diagnoseprocessen",
      ["diagnose", "diagnoseproces", "udredning", "vurdering", "dsm"],
      usedKeys,
      false,
      wantsDeep ? 14 : 7
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Vigtigt at skille fra",
      ["skille", "differential", "andet end", "komorbid", "overlap"],
      usedKeys,
      true,
      wantsDeep ? 10 : 5
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Støtte og behandling",
      ["behandling", "stoette", "hjaelp", "ressourcer", "strategi"],
      usedKeys,
      false,
      wantsDeep ? 14 : 7
    );

    if (blocks.length <= 4) {
      const adult = formatLimitedLocalDiagnosisBlock(
        role === "Forælder" ? "Hvad kan den voksne gøre?" : "Hvad kan læreren gøre?",
        shortView.hvad_kan_den_voksne_gore || entry?.hvad_kan_den_voksne_gore,
        true,
        wantsDeep ? 8 : 5
      );
      if (adult) blocks.push(adult, "");
    }

    blocks.push(
      "Vigtigt: CDA kan forklare mønstre og støttebehov, men stiller ikke diagnose."
    );

    return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const what = formatLocalDiagnosisBlock(
    "Hvad er det?",
    shortView.hvad_er_det || entry?.hvad_er_det || entry?.beskrivelse,
    false
  );
  if (what) blocks.push(what, "");

  const signs = formatLocalDiagnosisBlock(
    "Hvordan viser det sig?",
    shortView.hvordan_viser_det_sig || entry?.hvordan_viser_det_sig || entry?.tegn,
    true
  );
  if (signs) blocks.push(signs, "");

  const misunderstandings = formatLocalDiagnosisBlock(
    "Hvad misforstås ofte?",
    shortView.hvad_misforstaas_ofte || entry?.hvad_misforstaas_ofte,
    true
  );
  if (misunderstandings) blocks.push(misunderstandings, "");

  const adult = formatLocalDiagnosisBlock(
    role === "Forælder" ? "Hvad kan den voksne gøre?" : "Hvad kan læreren gøre?",
    shortView.hvad_kan_den_voksne_gore || entry?.hvad_kan_den_voksne_gore,
    true
  );
  if (adult) blocks.push(adult, "");

  if (wantsDeep) {
    const usedKeys = new Set();

    pushPreferredLongBlock(
      blocks,
      longView,
      "Hvad er det fagligt?",
      ["hvad er", "definition", "hovedomraader", "intro"],
      usedKeys,
      false,
      14
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Typiske symptomer og mønstre",
      ["typiske symptomer", "symptom", "kendetegn", "viser sig"],
      usedKeys,
      false,
      16
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Når adfærden bliver misforstået",
      ["misforstaa", "myter", "tolket forkert"],
      usedKeys,
      false,
      12
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Årsager og risikofaktorer",
      ["aarsag", "risiko", "saarbarhed", "neurobiologi"],
      usedKeys,
      false,
      12
    );

    pushPreferredLongBlock(
      blocks,
      longView,
      "Behandling og støtte",
      ["behandling", "stoette", "hjaelp", "ressourcer"],
      usedKeys,
      false,
      14
    );
  }

  blocks.push(
    "Næste valg: Skriv kort, dybdegående eller stop. Skriver du en konkret situation, kan Heidi vurdere sagen med CDA-data."
  );

  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

function isConcreteKnownDiagnosisCase(message) {
  const text = normalizeDiagnosisPhrase(message);
  const words = text.split(" ").filter(Boolean);

  const personPatterns = [
    "elev",
    "barn",
    "dreng",
    "pige",
    "min son",
    "min datter",
    "mit barn",
    "han",
    "hun",
  ];

  const observationPatterns = [
    "har",
    "er blevet",
    "bliver",
    "virker",
    "viser",
    "reagerer",
    "undgar",
    "traekker sig",
    "kan ikke",
    "begyndt",
    "den sidste tid",
    "mere end tidligere",
    "ofte",
    "vedvarende",
    "pludselig",
    "aendret",
    "forvaerret",
  ];

  const hasPerson = personPatterns.some((pattern) =>
    containsDiagnosisPhrase(text, pattern)
  );

  const observationCount = observationPatterns.filter((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  ).length;

  const startsAsDefinition = [
    "hvad er",
    "forklar",
    "definition",
    "what is",
    "explain",
  ].some((pattern) => text.startsWith(normalizeDiagnosisPhrase(pattern)));

  if (startsAsDefinition && words.length < 20) {
    return false;
  }

  return hasPerson && words.length >= 12 && observationCount >= 2;
}

function buildAutomaticComorbidityContext(diagnosisMeta) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_Komorbiditet.json"
  );

  const rawData = readJsonFile(
    filePath,
    "data/CDA_Komorbiditet.json blev ikke fundet"
  );

  const entries = Array.isArray(rawData?.komorbiditet_data)
    ? rawData.komorbiditet_data
    : [];

  const candidates = new Set(
    [
      diagnosisMeta?.id,
      diagnosisMeta?.navn,
      diagnosisMeta?.fuld_navn,
      String(diagnosisMeta?.fil || "").replace(/\.json$/i, ""),
      ...(STRUCTURED_DIAGNOSIS_ALIASES[diagnosisMeta?.id] || []),
    ]
      .map((value) => normalizeDiagnosisPhrase(value))
      .filter(Boolean)
  );

  const primary = entries.find((entry) => {
    const id = normalizeDiagnosisPhrase(entry?.id);
    const name = normalizeDiagnosisPhrase(entry?.primary_diagnosis);
    return candidates.has(id) || candidates.has(name);
  });

  if (!primary || !Array.isArray(primary.comorbidities)) {
    return null;
  }

  const patterns = primary.comorbidities.map((item) => ({
    id: item?.id || null,
    internal_pattern_name: item?.suspected_comorbidity || null,
    short_explanation: item?.kort_forklaring || null,
    signs_beyond_known_diagnosis: Array.isArray(
      item?.naar_grunddiagnosen_ikke_forklarer_det_hele
    )
      ? item.naar_grunddiagnosen_ikke_forklarer_det_hele.slice(0, 3)
      : [],
    observations_for_school: Array.isArray(
      item?.det_skal_laereren_kigge_efter
    )
      ? item.det_skal_laereren_kigge_efter.slice(0, 5)
      : [],
    typical_school_expression: Array.isArray(
      item?.saadan_ses_det_typisk_i_skole
    )
      ? item.saadan_ses_det_typisk_i_skole.slice(0, 4)
      : [],
  }));

  if (patterns.length === 0) {
    return null;
  }

  return {
    source: "CDA_Komorbiditet.json",
    primary_id: primary.id || diagnosisMeta?.id || null,
    primary_diagnosis:
      primary.primary_diagnosis || diagnosisMeta?.navn || null,
    overview: primary.overview || null,
    observation_patterns: patterns,
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
  } else if (text.includes("refleksion") || text.includes("laere") || text.includes("lære")) {
    add("Refleksion", reflection);
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

function findNamedSpecialistInMessage(message) {
  const panelResult = getSpecialistPanel();
  const specialists = Array.isArray(panelResult?.data?.specialists)
    ? panelResult.data.specialists
    : [];

  const text = normalizeDiagnosisPhrase(message);
  if (!text) {
    return null;
  }

  const withPersonalName = specialists
    .map((specialist) => {
      const fullName = String(specialist?.name || "").trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const personalName = parts.slice(-2).join(" ");
      const lastName = parts.slice(-1).join(" ");
      return { specialist, personalName, lastName };
    })
    .filter((item) => item.personalName);

  const fullNameMatch = withPersonalName.find(
    (item) =>
      normalizeDiagnosisPhrase(item.personalName).length > 0 &&
      text.includes(normalizeDiagnosisPhrase(item.personalName))
  );
  if (fullNameMatch) {
    return fullNameMatch.specialist;
  }

  const lastNameMatches = withPersonalName.filter(
    (item) =>
      item.lastName.length >= 4 &&
      text.includes(normalizeDiagnosisPhrase(item.lastName))
  );
  if (lastNameMatches.length === 1) {
    return lastNameMatches[0].specialist;
  }

  return null;
}

function buildSingleSpecialistPanel(specialist) {
  if (!specialist) {
    return { specialistIds: [], specialistSummaries: [], indexText: "" };
  }

  const cleanValue = (value, max = 160) =>
    limitSpecialistText(value, max)
      .replace(/[|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const keywords = Array.isArray(specialist?.keywords)
    ? specialist.keywords.slice(0, 8).join(", ")
    : "";

  const row = [
    cleanValue(specialist?.id, 80),
    cleanValue(specialist?.name, 120),
    cleanValue(specialist?.group, 120),
    cleanValue(specialist?.function, 220),
    cleanValue(keywords, 180),
  ].join("|");

  return {
    specialistIds: [String(specialist?.id || "")].filter(Boolean),
    specialistSummaries: [
      {
        id: String(specialist?.id || ""),
        name: String(specialist?.name || ""),
        group: String(specialist?.group || ""),
        function: String(specialist?.function || ""),
      },
    ],
    indexText: ["KOLONNER:id|navn|gruppe|funktion|keywords", row].join("\n"),
  };
}

function isRoleplayTriggerMessage(message) {
  const text = normalizeDiagnosisPhrase(message);
  const triggerPatterns = [
    "rollespil",
    "rollespil start",
    "kor en haendelse",
    "kor haendelse",
    "traen en situation",
    "traen situation",
    "ov en samtale",
    "ov samtale",
    "ppr mode",
    "skole hjem samtale",
  ];

  return triggerPatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}

function isRoleplayContextActive(message, pendingActionValue) {
  return (
    isRoleplayTriggerMessage(message) || pendingActionValue === "roleplay_active"
  );
}

function buildRoleplayRuleInjection() {
  const rulesData = readJsonFile(
    path.join(process.cwd(), "data", "prompt_rules.json"),
    "data/prompt_rules.json blev ikke fundet"
  );

  const roleplayRules = rulesData?.system_rules?.roleplay_rules || {};
  const roleplayLearningRules =
    rulesData?.system_rules?.roleplay_learning_rules || {};

  return [
    "",
    "════════════════════════════════════════",
    "VIGTIGT — ROLLESPIL/TRÆNING ER AKTIVT I DENNE SAMTALE.",
    "Dette svar er IKKE normal rådgivning, selvom resten af denne prompt beskriver den normale CDA-stil.",
    "DU MÅ ALDRIG bruge overskrifterne 'Det peger mest på', 'Det vigtigste her er' eller 'Det kan du gøre nu' i dette svar — uanset hvor naturligt det ellers ville føles. De hører til normal drift, ikke rollespil.",
    "Brug i stedet KUN rollespillets egen struktur, beskrevet i roleplay_rules og roleplay_learning_rules herunder.",
    "════════════════════════════════════════",
    "",
    "roleplay_rules (allerede indlæst, kald ikke getPromptRules for denne):",
    JSON.stringify(roleplayRules, null, 2),
    "",
    "roleplay_learning_rules (allerede indlæst, kald ikke getPromptRules for denne):",
    JSON.stringify(roleplayLearningRules, null, 2),
    "",
    "Så længe rollespillet/træningen fortsætter (brugeren er midt i en hændelse, en trænet situation eller en samtaleøvelse), skal du afslutte dit svar med [[PENDING_ACTION:ROLEPLAY_ACTIVE]] som allersidste tegn. Markøren vises ikke til brugeren. Udelad markøren, når rollespillet/træningen er afsluttet, eller brugeren tydeligt skifter emne.",
  ].join("\n");
}

function isDirectSpecialistPanelRequest(message) {
  const text = normalizeDiagnosisPhrase(message);
  const directPatterns = [
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "specialistperspektiv",
    "tværfaglig vurdering",
    "tvaerfaglig vurdering",
    "hvad siger psykologen",
    "psykologens vinkel",
    "psykologvinkel",
    "hvad ville psykologen sige",
    "hvad siger ppr",
    "ppr vinkel",
    "ppr-vinkel",
  ];

  if (directPatterns.some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))) {
    return true;
  }

  return Boolean(findNamedSpecialistInMessage(message));
}

function isCaseSpecialistsInvolvedRequest(message) {
  const text = normalizeDiagnosisPhrase(message);
  const directPatterns = [
    "hvilke specialister har været inde over",
    "hvilke specialister har set på",
    "hvilke specialister har været involveret",
    "hvilke specialister er relevante for denne case",
    "hvilke specialister er relevante for denne sag",
    "hvem har kigget på denne case",
    "hvem har kigget på denne sag",
    "specialister involveret i denne sag",
    "specialister involveret i denne case",
    "hvilket specialistteam",
  ];

  return directPatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}

function limitSpecialistText(value, max = 260) {
  const text = formatLocalCaseValue(value)
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max).trim()}…`;
}

function getRequestedSpecialistAngle(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (findNamedSpecialistInMessage(message)) {
    return "named";
  }

  if (text.includes("psykolog")) {
    return "psychologist";
  }

  if (text.includes("ppr")) {
    return "ppr";
  }

  return "specialists";
}

function isLocalPprCaseAngleRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text.includes("ppr")) {
    return false;
  }

  const pprPatterns = [
    "ppr",
    "hvad siger ppr",
    "hvad ville ppr",
    "hvad vil ppr",
    "hvad ser ppr",
    "hvad ville ppr se",
    "hvad ville ppr kigge paa",
    "hvad ville ppr kigge på",
    "ppr vinkel",
    "ppr-vinkel",
    "ppr se",
    "ppr spoerge",
    "ppr spørge",
  ];

  return pprPatterns.some((pattern) => {
    const normalizedPattern = normalizeDiagnosisPhrase(pattern);
    return text === normalizedPattern || text.includes(normalizedPattern);
  });
}


function buildLocalPprAngleReply(caseData, activeContext) {
  const title = formatLocalCaseValue(
    caseData?.titel || caseData?.title || caseData?.id || "Aktiv sag"
  );
  const problem = limitSpecialistText(
    caseData?.problem ||
      caseData?.kort_beskrivelse ||
      caseData?.description ||
      caseData?.beskrivelse ||
      activeContext?.summary ||
      activeContext?.last_user_message,
    240
  );

  const lines = [];

  if (title) {
    lines.push(`**PPR-vinkel**`, `Ud fra ${title}${problem ? `: ${problem}` : ""}`);
  } else {
    lines.push("**PPR-vinkel**");
  }

  lines.push(
    "",
    "PPR ville især se på:",
    "- Hvad sker lige før reaktionen?",
    "- Hvor hurtigt eskalerer det, og hvad hjælper ned igen?",
    "- Sker mønstret hos flere voksne/timer, eller kun i én situation?",
    "- Hvornår lykkes barnet bedre?",
    "",
    "**Hav klar til PPR**",
    "- 2-3 konkrete episoder med før-under-efter.",
    "- Hvad de voksne gjorde.",
    "- Hvad der virkede lidt.",
    "- Hvor ofte og hvor det sker."
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildCompactSpecialistCaseContext(caseData, activeContext) {
  if (caseData) {
    const lines = [
      "AKTIV CASE — KORT GRUNDLAG",
      `id: ${limitSpecialistText(caseData.id, 80) || "-"}`,
      `titel: ${limitSpecialistText(caseData.titel || caseData.title, 120) || "-"}`,
    ];

    const fields = [
      ["alder", caseData.alder || caseData.age, 40],
      ["diagnose/spor", caseData.diagnoser || caseData.diagnoses || caseData.relevante_diagnoser, 120],
      ["tema", caseData.tema || caseData.theme || caseData.kategori, 160],
      ["problem", caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse, 360],
      ["barnets oplevelse", caseData.barnets_oplevelse || caseData.barnets_perspektiv || caseData.childVoice, 220],
      ["typisk fejl", caseData.typisk_fejl || caseData.mistakes, 220],
      ["løsning", caseData.løsning || caseData.loesning || caseData.solution, 300],
      ["tiltag", caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer || caseData.tools, 300],
    ];

    for (const [label, value, max] of fields) {
      const text = limitSpecialistText(value, max);
      if (text) {
        lines.push(`${label}: ${text}`);
      }
    }

    return lines.join("\n");
  }

  if (hasActiveCaseContext(activeContext)) {
    return [
      "AKTIV SAG — KORT GRUNDLAG",
      activeContext.summary ? `sag: ${limitSpecialistText(activeContext.summary, 420)}` : "",
      activeContext.known_context ? `kontekst: ${limitSpecialistText(activeContext.known_context, 220)}` : "",
      activeContext.last_user_message ? `sidste brugerbesked: ${limitSpecialistText(activeContext.last_user_message, 260)}` : "",
      activeContext.last_guidance_summary ? `seneste råd: ${limitSpecialistText(activeContext.last_guidance_summary, 260)}` : "",
    ].filter(Boolean).join("\n");
  }

  return "";
}

function getTargetedSpecialistPanel(angle, message, extraText = "") {
  const panelResult = getSpecialistPanel();
  const specialists = Array.isArray(panelResult?.data?.specialists)
    ? panelResult.data.specialists
    : [];

  const text = normalizeDiagnosisPhrase(`${message} ${extraText}`);
  const words = new Set(text.split(" ").filter((word) => word.length >= 4));

  const anglePatterns = {
    psychologist: ["psykolog", "psykologisk", "psykologi", "ppr"],
    ppr: ["ppr", "skolepsykolog", "raadgivning", "rådgivning", "observation", "indstilling"],
    specialists: [],
    case_team: [],
  };

  const specialistText = (specialist) => normalizeDiagnosisPhrase([
    specialist?.id,
    specialist?.name,
    specialist?.category,
    specialist?.group,
    specialist?.function,
    specialist?.disclaimer,
    ...(Array.isArray(specialist?.keywords) ? specialist.keywords : []),
  ].filter(Boolean).join(" "));

  const scored = specialists.map((specialist, index) => {
    const haystack = specialistText(specialist);
    let score = 0;

    for (const pattern of anglePatterns[angle] || []) {
      if (haystack.includes(normalizeDiagnosisPhrase(pattern))) {
        score += 40;
      }
    }

    for (const word of words) {
      if (haystack.includes(word)) {
        score += 3;
      }
    }

    return { specialist, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const maxCount = angle === "case_team" ? 5 : angle === "specialists" ? 3 : 1;
  let selected = scored.filter((item) => item.score > 0).slice(0, maxCount);

  if (selected.length === 0 && specialists.length > 0) {
    selected = scored.slice(0, maxCount);
  }

  const cleanValue = (value, max = 160) =>
    limitSpecialistText(value, max)
      .replace(/[|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rows = selected.map(({ specialist }) => {
    const keywords = Array.isArray(specialist?.keywords)
      ? specialist.keywords.slice(0, 8).join(", ")
      : "";

    return [
      cleanValue(specialist?.id, 80),
      cleanValue(specialist?.name, 120),
      cleanValue(specialist?.group, 120),
      cleanValue(specialist?.function, 220),
      cleanValue(keywords, 180),
    ].join("|");
  });

  return {
    specialistIds: selected
      .map(({ specialist }) => String(specialist?.id || ""))
      .filter(Boolean),
    specialistSummaries: selected
      .map(({ specialist }) => ({
        id: String(specialist?.id || ""),
        name: String(specialist?.name || ""),
        group: String(specialist?.group || ""),
        function: String(specialist?.function || ""),
      }))
      .filter((specialist) => specialist.id),
    indexText: [
      "KOLONNER:id|navn|gruppe|funktion|keywords",
      ...rows,
    ].join("\n"),
  };
}

function getCompactSpecialistPanelIndex() {
  const panelResult = getSpecialistPanel();
  const specialists = Array.isArray(panelResult?.data?.specialists)
    ? panelResult.data.specialists
    : [];

  const cleanValue = (value) =>
    String(value || "")
      .replace(/[|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rows = specialists.map((specialist) => {
    const voiceProfile = specialist?.voice_profile || {};

    return [
      cleanValue(specialist?.id),
      cleanValue(specialist?.name),
      cleanValue(specialist?.category),
      cleanValue(specialist?.group),
      cleanValue(specialist?.function),
      (Array.isArray(specialist?.keywords)
        ? specialist.keywords
        : []
      )
        .map((keyword) => cleanValue(keyword))
        .filter(Boolean)
        .join(","),
      cleanValue(voiceProfile?.tone),
      cleanValue(voiceProfile?.style),
      cleanValue(specialist?.disclaimer),
    ].join("|");
  });

  return {
    specialistIds: specialists
      .map((specialist) => String(specialist?.id || ""))
      .filter(Boolean),
    specialistSummaries: specialists
      .map((specialist) => ({
        id: String(specialist?.id || ""),
        name: String(specialist?.name || ""),
        group: String(specialist?.group || ""),
        function: String(specialist?.function || ""),
      }))
      .filter((specialist) => specialist.id),
    indexText: [
      "KOLONNER:id|navn|kategori|gruppe|funktion|keywords|tone|stil|disclaimer",
      ...rows,
    ].join("\n"),
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

function humanizeTemplateSlug(value) {
  return String(value || "")
    .replace(/\.md$/i, "")
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function collectMarkdownTemplateFiles(directory, templatesRoot, projectRoot) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMarkdownTemplateFiles(entryPath, templatesRoot, projectRoot));
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
      continue;
    }

    const relativeFromTemplates = path.relative(templatesRoot, entryPath);
    const relativeFromProject = path.relative(projectRoot, entryPath).split(path.sep).join("/");
    const parts = relativeFromTemplates.split(path.sep);
    const folder = parts.length > 1 ? parts[0] : "standalone";
    const fileBase = path.basename(entry.name, ".md");

    let firstHeading = "";
    try {
      const markdown = fs.readFileSync(entryPath, "utf8");
      const headingMatch = markdown.match(/^#\s+(.+)$/m);
      firstHeading = headingMatch?.[1]?.trim() || "";
    } catch {
      firstHeading = "";
    }

    const title = firstHeading || humanizeTemplateSlug(fileBase);
    const categoryTitle = folder === "standalone"
      ? "Selvstændige skabeloner"
      : humanizeTemplateSlug(folder);
    const plainWords = [
      folder,
      fileBase,
      title,
      categoryTitle,
      relativeFromProject,
    ]
      .join(" ")
      .replace(/[-_/\.]+/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3);

    const extraKeywords = [];
    const normalizedIdentity = normalizeTemplateSearch(`${folder} ${fileBase} ${title}`);

    if (normalizedIdentity.includes("observation") || normalizedIdentity.includes("indsatslog")) {
      extraKeywords.push(
        "observation",
        "observationslog",
        "indsatslog",
        "skabelon til observation",
        "vis skabelon til observation",
        "PPR dokumentation",
        "dokumentation",
        "før under efter",
        "foer under efter"
      );
    }

    if (normalizedIdentity.includes("kommunikationslog")) {
      extraKeywords.push(
        "kommunikationslog",
        "skole hjem",
        "skole hjem log",
        "kontaktbog",
        "hjem skole"
      );
    }

    if (normalizedIdentity.includes("skolevaegering")) {
      extraKeywords.push(
        "skolevægring",
        "skolevaegering",
        "skolefravær",
        "skolefravaer",
        "fravær",
        "fremmøde",
        "tilbage til skole"
      );
    }

    files.push({
      id: relativeFromProject.replace(/\.md$/i, ""),
      title,
      category: categoryTitle,
      category_id: folder,
      description: title,
      content_file: relativeFromProject,
      search_keywords: Array.from(new Set([...plainWords, ...extraKeywords])),
      command_triggers: [title, fileBase, relativeFromProject],
      source: "templates_folder_scan",
    });
  }

  return files;
}

function getTemplateFiles() {
  const projectRoot = path.resolve(process.cwd());
  const templatesRoot = path.join(projectRoot, "templates");
  const scannedTemplates = collectMarkdownTemplateFiles(
    templatesRoot,
    templatesRoot,
    projectRoot
  );

  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_TemplateFiles.json"
  );

  let registry = {};

  if (fs.existsSync(filePath)) {
    registry = readJsonFile(
      filePath,
      "data/CDA_TemplateFiles.json blev ikke fundet"
    );
  }

  const categories = Array.isArray(registry?.categories)
    ? registry.categories
    : [];
  const standalone = Array.isArray(registry?.standalone)
    ? registry.standalone
    : [];

  const categoryTemplates = categories.flatMap((category) => {
    const files = Array.isArray(category?.files) ? category.files : [];

    return files.map((file) => ({
      id: file?.id || null,
      title: file?.title || null,
      category: category?.title || null,
      category_id: category?.id || null,
      description: file?.description || category?.description || null,
      content_file: file?.content_file || null,
      search_keywords: [
        ...(Array.isArray(category?.keywords) ? category.keywords : []),
        ...(Array.isArray(file?.keywords) ? file.keywords : []),
      ],
      command_triggers: [file?.title, file?.id].filter(Boolean),
      source: "template_files_registry",
    }));
  });

  const standaloneTemplates = standalone.map((file) => ({
    id: file?.id || null,
    title: file?.title || null,
    category: "Selvstændige skabeloner",
    category_id: "standalone",
    description: file?.description || null,
    content_file: file?.content_file || null,
    search_keywords: Array.isArray(file?.keywords) ? file.keywords : [],
    command_triggers: [file?.title, file?.id].filter(Boolean),
    source: "template_files_registry",
  }));

  const registryTemplates = [...categoryTemplates, ...standaloneTemplates]
    .filter((template) => template.id && template.title && template.content_file);

  const seenContentFiles = new Set();
  // 23B.6C: Brug det samme statiske template-register som dropdownen som
  // primær kilde. Folder-scan bevares kun som fallback for filer, der endnu
  // ikke er registreret. Det sikrer bl.a. at kategori-keywords som
  // "visuel dagsplan" peger på 00-overblik lokalt før OpenAI.
  const templates = [...registryTemplates, ...scannedTemplates]
    .filter((template) => {
      const contentFile = String(template?.content_file || "").trim();

      if (!template?.id || !template?.title || !contentFile) {
        return false;
      }

      if (seenContentFiles.has(contentFile)) {
        return false;
      }

      seenContentFiles.add(contentFile);
      return true;
    });

  return {
    success: true,
    source: "local",
    templates,
    categories,
    standalone,
    total: templates.length,
  };
}


function normalizeTemplateSearch(value) {
  return normalizeDiagnosisPhrase(value);
}

function templatePhraseIsPresent(messageText, value) {
  const phrase = normalizeTemplateSearch(value);

  if (!phrase || phrase.length < 4) {
    return false;
  }

  return ` ${messageText} `.includes(` ${phrase} `);
}

function getTemplateRequestSignals(message, templates) {
  const text = normalizeTemplateSearch(message);

  const bankPatterns = [
    "templatebank",
    "skabelonbank",
    "cda templatebank",
    "cda template bank",
    "cda skabelonbank",
    "template bank",
    "cda template",
    "cda skabelon",
    "eksisterende template",
    "eksisterende skabelon",
    "existing template",
    "template library",
  ];

  const listPatterns = [
    "vis alle",
    "hvilke skabeloner",
    "hvilke templates",
    "liste over",
    "oversigt over",
    "hvad findes",
    "show all",
    "which templates",
    "list templates",
  ];

  const directTemplateCommandPatterns = [
    "vis guide",
    "vis en guide",
    "vis guide til",
    "hent guide",
    "hent en guide",
    "find guide",
    "find en guide",
    "aabn guide",
    "åbn guide",
    "vis skabelon",
    "vis en skabelon",
    "vis skabelon til",
    "hent skabelon",
    "hent en skabelon",
    "find skabelon",
    "find en skabelon",
    "aabn skabelon",
    "åbn skabelon",
    "vis template",
    "hent template",
    "find template",
    "aabn template",
    "åbn template",
    "find skema",
    "find et skema",
    "hent skema",
    "hent et skema",
    "vis skema",
    "vis et skema",
    "lav et skema",
    "lav en skabelon",
  ];

  const livePracticePatterns = [
    "jeg har en dreng",
    "jeg har en pige",
    "jeg har et barn",
    "jeg har en elev",
    "vi har en dreng",
    "vi har en pige",
    "vi har et barn",
    "vi har en elev",
    "en dreng",
    "en pige",
    "en elev",
    "et barn",
    "han siger",
    "hun siger",
    "han kan ikke",
    "hun kan ikke",
    "han gider ikke",
    "hun gider ikke",
    "hvad gor jeg",
    "hvad gør jeg",
    "hvad kan jeg gore",
    "hvad kan jeg gøre",
  ];

  const directBankRequest = bankPatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const directTemplateCommand = directTemplateCommandPatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const livePracticeSituation = livePracticePatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const indirectResourcePatterns = [
    "har i noget jeg kan bruge",
    "har du noget jeg kan bruge",
    "findes der noget jeg kan bruge",
    "er der noget jeg kan bruge",
    "hvad kan jeg bruge",
    "har i et vaerktoj",
    "har du et vaerktoj",
    "findes der et vaerktoj",
    "har i en guide",
    "har du en guide",
    "findes der en guide",
    "noget jeg kan bruge til",
    "et redskab til",
    "en ressource til",
  ];

  const indirectResourceRequest = !livePracticeSituation && indirectResourcePatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const knownTemplateMention = templates.some((template) => {
    const candidates = [
      template?.id,
      template?.title,
      ...(Array.isArray(template?.command_triggers)
        ? template.command_triggers
        : []),
      ...(Array.isArray(template?.search_keywords)
        ? template.search_keywords
        : []),
    ];

    return candidates.some((candidate) =>
      templatePhraseIsPresent(text, candidate)
    );
  });

  const explicitTemplateRequest = directBankRequest || directTemplateCommand;
  const allowedKnownTemplateMention = knownTemplateMention && !livePracticeSituation;

  const listRequest =
    directBankRequest &&
    listPatterns.some((pattern) =>
      text.includes(normalizeTemplateSearch(pattern))
    );

  return {
    text,
    directBankRequest,
    directTemplateCommand,
    livePracticeSituation,
    indirectResourceRequest,
    knownTemplateMention,
    listRequest,
    isDirectRequest: explicitTemplateRequest || allowedKnownTemplateMention,
    isTemplateRequest:
      explicitTemplateRequest ||
      allowedKnownTemplateMention ||
      indirectResourceRequest,
  };
}

function findBestLocalTemplate(message, templates) {
  const text = normalizeTemplateSearch(message);
  const ignoredWords = new Set([
    "hent",
    "find",
    "vis",
    "lav",
    "brug",
    "gerne",
    "eksisterende",
    "skabelon",
    "skabelonen",
    "skabeloner",
    "template",
    "templates",
    "templatebank",
    "skabelonbank",
    "cda",
    "fra",
    "til",
    "for",
    "med",
    "den",
    "det",
    "der",
    "som",
    "ikke",
    "opfind",
    "selv",
    "noget",
    "show",
    "existing",
    "library",
    "from",
    "and",
    "the",
  ]);

  const queryWords = text
    .split(" ")
    .map((word) => word.trim())
    .filter(
      (word) =>
        word.length >= 3 &&
        !ignoredWords.has(word)
    );

  const includesAnyTemplatePhrase = (phrases) =>
    phrases.some((phrase) =>
      text.includes(normalizeTemplateSearch(phrase))
    );

  const hasPlanChangeNeed =
    includesAnyTemplatePhrase([
      "plan aendrer",
      "planen aendrer",
      "plan aendres",
      "planen aendres",
      "dagens plan aendrer",
      "dagens plan aendres",
      "aendring i planen",
      "aendringer i planen",
      "uventet aendring",
      "uventede aendringer",
      "planlaegning aendrer sig",
    ]) ||
    (
      includesAnyTemplatePhrase([
        "plan",
        "dagsplan",
        "dagsskema",
      ]) &&
      includesAnyTemplatePhrase([
        "aendrer",
        "aendres",
        "aendring",
        "aendringer",
        "uventet",
        "anderledes",
      ])
    );

  const hasTransitionNeed = includesAnyTemplatePhrase([
    "overgang",
    "overgange",
    "skift",
    "skifte",
    "aktivitetsskift",
    "lokaleskift",
    "vikar",
    "aflysning",
  ]);

  const hasPredictabilityNeed = includesAnyTemplatePhrase([
    "forudsigelig",
    "forudsigelighed",
    "utryg naar",
    "utryg ved",
    "ved ikke hvad der skal ske",
  ]);

  const hasSchoolAvoidanceNeed = includesAnyTemplatePhrase([
    "skolevaeg",
    "skolefravaer",
    "fravaer",
    "fremmoede",
    "vil ikke i skole",
    "kommer ikke i skole",
    "tilbage til skole",
    "tilbagevenden til skole",
    "skoleundgaaelse",
  ]);

  const getSemanticTemplateAdjustment = (template) => {
    const templateId = normalizeTemplateSearch(template?.id);
    const title = normalizeTemplateSearch(template?.title);
    const category = normalizeTemplateSearch(template?.category);
    const searchableIdentity = `${templateId} ${title} ${category}`;

    let adjustment = 0;
    const semanticMatches = [];

    if (hasPlanChangeNeed) {
      if (
        searchableIdentity.includes("aendringer og reserveplan") ||
        templateId.includes("visuel dagsplan aendringer")
      ) {
        adjustment += 260;
        semanticMatches.push("plan_change_primary");
      } else if (
        searchableIdentity.includes("uventede aendringer") ||
        templateId.includes("overgange og skift uventede")
      ) {
        adjustment += 220;
        semanticMatches.push("plan_change_secondary");
      } else if (
        category.includes("visuel dagsplan") ||
        category.includes("overgange og skift")
      ) {
        adjustment += 70;
        semanticMatches.push("plan_change_category");
      }
    }

    if (hasTransitionNeed) {
      if (
        searchableIdentity.includes("uventede aendringer") ||
        searchableIdentity.includes("individuel overgangsaftale") ||
        searchableIdentity.includes("varsling og visuel stoette")
      ) {
        adjustment += 130;
        semanticMatches.push("transition_specific");
      } else if (category.includes("overgange og skift")) {
        adjustment += 55;
        semanticMatches.push("transition_category");
      }
    }

    if (hasPredictabilityNeed) {
      if (
        category.includes("visuel dagsplan") ||
        category.includes("overgange og skift")
      ) {
        adjustment += 45;
        semanticMatches.push("predictability");
      }
    }

    const isSchoolAvoidanceTemplate =
      templateId.includes("skolevaegering") ||
      title.includes("skolevaegering") ||
      title.includes("skolevaeringsguide");

    if (isSchoolAvoidanceTemplate) {
      if (hasSchoolAvoidanceNeed) {
        adjustment += 180;
        semanticMatches.push("school_avoidance_present");
      } else {
        adjustment -= 220;
        semanticMatches.push("school_avoidance_absent");
      }
    }

    return {
      adjustment,
      semanticMatches,
    };
  };

  const scoreTemplate = (template) => {
    const title = normalizeTemplateSearch(template?.title);
    const id = normalizeTemplateSearch(
      String(template?.id || "").replace(/_/g, " ")
    );
    const category = normalizeTemplateSearch(template?.category);
    const subcategory = normalizeTemplateSearch(template?.subcategory);
    const description = normalizeTemplateSearch(
      template?.description || template?.content?.description
    );

    const triggers = Array.isArray(template?.command_triggers)
      ? template.command_triggers.map(normalizeTemplateSearch)
      : [];

    const keywords = Array.isArray(template?.search_keywords)
      ? template.search_keywords.map(normalizeTemplateSearch)
      : [];

    const tags = Array.isArray(template?.tags)
      ? template.tags.map(normalizeTemplateSearch)
      : [];

    let score = 0;
    const matchedFields = new Set();
    const matchedWords = new Set();

    if (title && templatePhraseIsPresent(text, title)) {
      score += 300;
      matchedFields.add("title");
    }

    if (id && templatePhraseIsPresent(text, id)) {
      score += 240;
      matchedFields.add("id");
    }

    for (const trigger of triggers) {
      if (trigger && templatePhraseIsPresent(text, trigger)) {
        score += 220;
        matchedFields.add("command_trigger");
      }
    }

    for (const keyword of keywords) {
      if (keyword && templatePhraseIsPresent(text, keyword)) {
        score += 80;
        matchedFields.add("search_keyword");
      }
    }

    const titleWords = new Set(title.split(" ").filter(Boolean));
    const triggerWords = new Set(
      triggers.join(" ").split(" ").filter(Boolean)
    );
    const keywordWords = new Set(
      keywords.join(" ").split(" ").filter(Boolean)
    );
    const tagWords = new Set(
      tags.join(" ").split(" ").filter(Boolean)
    );
    const categoryWords = new Set(
      `${category} ${subcategory}`.split(" ").filter(Boolean)
    );
    const descriptionWords = new Set(
      description.split(" ").filter(Boolean)
    );

    const wordSetMatches = (wordSet, queryWord) =>
      Array.from(wordSet).some((candidate) =>
        searchWordMatches(queryWord, candidate)
      );

    for (const queryWord of queryWords) {
      if (wordSetMatches(titleWords, queryWord)) {
        score += 35;
        matchedWords.add(queryWord);
        matchedFields.add("title_words");
      } else if (wordSetMatches(triggerWords, queryWord)) {
        score += 28;
        matchedWords.add(queryWord);
        matchedFields.add("trigger_words");
      } else if (wordSetMatches(keywordWords, queryWord)) {
        score += 20;
        matchedWords.add(queryWord);
        matchedFields.add("keyword_words");
      } else if (wordSetMatches(tagWords, queryWord)) {
        score += 14;
        matchedWords.add(queryWord);
        matchedFields.add("tag_words");
      } else if (wordSetMatches(categoryWords, queryWord)) {
        score += 9;
        matchedWords.add(queryWord);
        matchedFields.add("category_words");
      } else if (wordSetMatches(descriptionWords, queryWord)) {
        score += 4;
        matchedWords.add(queryWord);
        matchedFields.add("description_words");
      }
    }

    if (matchedWords.size > 1) {
      score += matchedWords.size * 8;
    }

    const semanticAdjustment = getSemanticTemplateAdjustment(template);
    score += semanticAdjustment.adjustment;

    for (const semanticMatch of semanticAdjustment.semanticMatches) {
      matchedFields.add(semanticMatch);
    }

    return {
      template,
      score,
      matchedFields: Array.from(matchedFields),
      matchedWords: Array.from(matchedWords),
    };
  };

  const ranked = templates
    .map(scoreTemplate)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;

  if (!best || best.score < 35) {
    return null;
  }

  return best;
}


function getDirectTemplateFileRequest(message, template, options = {}) {
  const text = normalizeTemplateSearch(message);

  const modificationPatterns = [
    "tilpas",
    "tilpasse",
    "udfyld",
    "udfylde",
    "personliggor",
    "personliggore",
    "personaliser",
    "rediger",
    "aendr",
    "aendre",
    "omskriv",
    "forkort",
    "opsummer",
    "forklar",
    "oversaet",
    "indsæt",
    "indsaet",
    "brug den til",
    "lav den til",
    "adapt",
    "customize",
    "personalize",
    "fill in",
    "udfyldt",
    "med navnet",
    "med elevens",
    "for eleven",
    "for mit barn",
    "for min elev",
    "saet navn",
    "edit",
    "change",
    "rewrite",
    "shorten",
    "summarize",
    "explain",
    "translate",
  ];

  if (
    modificationPatterns.some((pattern) =>
      text.includes(normalizeTemplateSearch(pattern))
    )
  ) {
    return null;
  }

  const displayPatterns = [
    "hent",
    "vis",
    "gengiv",
    "åbn",
    "send",
    "uden aendringer",
    "opfind ikke",
    "show",
    "display",
    "retrieve",
    "open",
    "without changes",
  ];

  const hasDisplayIntent = displayPatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const exactCandidates = [
    template?.id,
    String(template?.id || "").replace(/_/g, " "),
    template?.title,
    ...(Array.isArray(template?.command_triggers)
      ? template.command_triggers
      : []),
  ]
    .map((candidate) => normalizeTemplateSearch(candidate))
    .filter(Boolean);

  const exactTemplateRequest = exactCandidates.includes(text);

  if (
    !hasDisplayIntent &&
    !exactTemplateRequest &&
    !options.allowIndirectResourceDisplay
  ) {
    return null;
  }

  const contentFile = String(template?.content_file || "").trim();

  if (!contentFile) {
    return null;
  }

  const projectRoot = path.resolve(process.cwd());
  const templatesRoot = path.resolve(projectRoot, "templates");
  const resolvedPath = path.resolve(projectRoot, contentFile);

  if (
    resolvedPath !== templatesRoot &&
    !resolvedPath.startsWith(`${templatesRoot}${path.sep}`)
  ) {
    throw new Error(
      `Ugyldig templatefil uden for templates-mappen: ${contentFile}`
    );
  }

  if (path.extname(resolvedPath).toLowerCase() !== ".md") {
    throw new Error(
      `Ugyldig filtype for direkte templatevisning: ${contentFile}`
    );
  }

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  const content = fs.readFileSync(resolvedPath, "utf8").trim();

  if (!content) {
    return null;
  }

  return {
    content,
    contentFile,
  };
}

function readLocalTemplateMarkdown(template) {
  const contentFile = String(template?.content_file || "").trim();

  if (!contentFile) {
    return null;
  }

  const projectRoot = path.resolve(process.cwd());
  const templatesRoot = path.resolve(projectRoot, "templates");
  const resolvedPath = path.resolve(projectRoot, contentFile);

  if (
    resolvedPath !== templatesRoot &&
    !resolvedPath.startsWith(`${templatesRoot}${path.sep}`)
  ) {
    throw new Error(
      `Ugyldig templatefil uden for templates-mappen: ${contentFile}`
    );
  }

  if (path.extname(resolvedPath).toLowerCase() !== ".md") {
    throw new Error(`Ugyldig templatefiltype: ${contentFile}`);
  }

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  const markdown = fs.readFileSync(resolvedPath, "utf8").trim();
  return markdown || null;
}

function buildLocalTemplateContext(template) {
  const content = template?.content || {};
  const fileMarkdown = readLocalTemplateMarkdown(template);

  return {
    id: template?.id || null,
    title: template?.title || null,
    category: template?.category || null,
    subcategory: template?.subcategory || null,
    target_group: template?.target_group || null,
    purpose: content?.purpose || null,
    description:
      template?.description || content?.description || null,
    use_cases: Array.isArray(content?.use_cases)
      ? content.use_cases
      : [],
    components: Array.isArray(content?.components)
      ? content.components
      : [],
    variables: template?.variables || null,
    template_markdown:
      fileMarkdown ||
      template?.template_markdown ||
      content?.template_markdown ||
      null,
    steps: Array.isArray(template?.steps)
      ? template.steps
      : [],
    cda_synthesis: template?.cda_synthesis || null,
    content_file: template?.content_file || null,
  };
}


function isPracticalDayPlanRequest(message) {
  const text = normalizeTemplateSearch(message);

  if (!text) {
    return false;
  }

  const hasDayPlanWord = [
    "dagsplan",
    "dagplan",
    "dagsskema",
    "visuel dagsplan",
    "skole hjem dagsplan",
    "morgenrutine",
    "aftenrutine",
    "rutinekort",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  if (!hasDayPlanWord) {
    return false;
  }

  const practicalIntent = [
    "lav",
    "byg",
    "opret",
    "hjælp mig med",
    "hjaelp mig med",
    "jeg skal bruge",
    "brugbar",
    "praktisk",
    "kopier",
    "udskriv",
    "print",
    "med emojis",
    "med emoji",
    "med ikoner",
    "med skift",
    "med timer",
    "frokost",
    "morgenmad",
    "godnathistorie",
    "sove",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const pureDisplayIntent = [
    "vis skabelon til",
    "vis guide til",
    "vis overblik",
    "vis information",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  return practicalIntent && !pureDisplayIntent;
}

function getPracticalDayPlanMode(message) {
  const text = normalizeTemplateSearch(message);

  const hasHomeSchool = [
    "skole hjem",
    "skole-hjem",
    "hjem skole",
    "hjemme",
    "forældre",
    "foraeldre",
    "før skole",
    "foer skole",
    "efter skole",
    "morgenmad",
    "ud til bil",
    "bil",
    "tv",
    "spil",
    "godnathistorie",
    "sove",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasEveningOnly = [
    "aftenrutine",
    "godnat",
    "godnathistorie",
    "sove",
    "sengetid",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasMorningOnly = [
    "morgenrutine",
    "morgenmad",
    "stå op",
    "staa op",
    "før skole",
    "foer skole",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  if (hasHomeSchool) return "home_school";
  if (hasEveningOnly) return "evening";
  if (hasMorningOnly) return "morning";
  return "school";
}

function buildPracticalDayPlanReply(message, language = "Dansk") {
  const mode = getPracticalDayPlanMode(message);

  const intro = language === "English"
    ? "Here is a copy-ready visual day plan with icons/emojis:"
    : "Her er en kopierbar visuel dagsplan med ikoner/emojis:";

  const note = language === "English"
    ? "Adjust times and activities to the child. Keep one fixed order and one calm backup plan."
    : "Tilpas tider og aktiviteter til barnet. Behold fast rækkefølge og én rolig reserveplan.";

  const schoolPlan = [
    "📅 VISUEL SKOLEDAGSPLAN",
    "",
    "🕗 08.00  👋 Kom ind / sig godmorgen",
    "🕘 08.10  🎒 Pak tasken ud",
    "🕤 08.20  🪑 Find plads / se dagens plan",
    "📚 08.30  Første opgave",
    "☕ 09.00  Kort pause",
    "📚 09.10  Arbejd videre",
    "🏃 09.45  Frikvarter",
    "🔢 10.15  Næste fag / aktivitet",
    "🔁 11.00  Forbered skift til frokost",
    "🍽️ 11.10  Frokost",
    "😌 11.35  Rolig pause",
    "🎨 12.00  Praktisk/kreativ aktivitet",
    "🧩 12.40  Kort opgave eller valgaktivitet",
    "🏁 13.00  Pak sammen / afslutning",
    "🏠 13.15  SFO / hjem",
    "",
    "🟡 HVIS PLANEN ÆNDRER SIG",
    "1. Den voksne fortæller det kort.",
    "2. Barnet får vist den nye rækkefølge.",
    "3. Barnet kan få en kort pause før næste skift.",
  ].join("\n");

  const homeSchoolPlan = [
    "📅 FÆLLES SKOLE-HJEM DAGSPLAN",
    "",
    "🏠 MORGEN HJEMME",
    "🛏️  Stå op",
    "🦷  Børste tænder",
    "👕  Tøj på",
    "🥣  Morgenmad",
    "🎒  Taske klar",
    "🚗  Ud til bil / afsted mod skole",
    "",
    "🏫 SKOLESTART",
    "👋  Modtagelse af kendt voksen",
    "🎒  Pak tasken ud",
    "🪑  Find plads / se dagens plan",
    "📚  Første korte opgave",
    "",
    "🏫 SKOLEDAG",
    "☕  Kort pause",
    "📚  Arbejd videre",
    "🏃  Frikvarter",
    "🍽️  Frokost",
    "😌  Rolig pause",
    "🏁  Afslutning / pak sammen",
    "",
    "🏠 EFTER SKOLE HJEMME",
    "🍎  Mad/snack",
    "😌  Pause uden krav",
    "🎮  Spil / skærmtid efter aftale",
    "📚  Lektier kun hvis aftalt",
    "🍽️  Aftensmad",
    "🛁  Bad / hygiejne",
    "📖  Godnathistorie / rolig aktivitet",
    "😴  Sove",
    "",
    "📝 KORT SKOLE-HJEM AFTALE",
    "- Hvad hjalp i morges? ____________________",
    "- Hvordan startede skoledagen? _____________",
    "- Hvad skal gentages i morgen? _____________",
  ].join("\n");

  const morningPlan = [
    "🌅 MORGENRUTINE FØR SKOLE",
    "",
    "🛏️  Stå op",
    "🚽  Toilet",
    "🦷  Børste tænder",
    "👕  Tøj på",
    "🥣  Morgenmad",
    "🎒  Taske klar",
    "👟  Sko og overtøj",
    "🚗  Ud til bil / afsted",
    "",
    "🟡 HVIS DET BLIVER SVÆRT",
    "☐ Kort pause",
    "☐ Voksen viser næste trin",
    "☐ Én besked ad gangen",
  ].join("\n");

  const eveningPlan = [
    "🌙 AFTENRUTINE",
    "",
    "🍽️  Aftensmad",
    "🎮  Spil / skærmtid efter aftale",
    "🛁  Bad / hygiejne",
    "👕  Nattøj",
    "🎒  Gør taske klar til i morgen",
    "📖  Godnathistorie / rolig aktivitet",
    "💡  Lys ned / rolig stemme",
    "😴  Sove",
    "",
    "🟡 HVIS DET BLIVER SVÆRT",
    "☐ Kort pause",
    "☐ Voksen gentager planen roligt",
    "☐ Samme rækkefølge i morgen",
  ].join("\n");

  const body = mode === "home_school"
    ? homeSchoolPlan
    : mode === "morning"
      ? morningPlan
      : mode === "evening"
        ? eveningPlan
        : schoolPlan;

  return [intro, "", "```text", body, "```", "", note].join("\n");
}

function isParentDayPlanMessageRequest(message) {
  const text = normalizeTemplateSearch(message);

  if (!text) {
    return false;
  }

  const hasParentMessage = [
    "besked til foraeldre",
    "besked til foraeldrene",
    "skriv til foraeldre",
    "skriv til foraeldrene",
    "mail til foraeldre",
    "mail til foraeldrene",
    "forældrebesked",
    "foraeldrebesked",
    "kort besked",
    "kort skrivelse",
    "tekst til hjemmet",
    "skole hjem besked",
    "skole-hjem besked",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasHomeRecipient = [
    "foraeldre",
    "foraeldrene",
    "forældre",
    "forældrene",
    "hjemmet",
    "hjem",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasDayPlan = [
    "dagsplan",
    "dagplan",
    "dagsskema",
    "visuel dagsplan",
    "morgenrutine",
    "aftenrutine",
    "skole hjem dagsplan",
    "skole-hjem dagsplan",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  return hasDayPlan && (hasParentMessage || hasHomeRecipient);
}

function getLocalCaseDisplayName(caseData) {
  const title = formatLocalCaseValue(caseData?.titel || caseData?.title || "");

  if (!title) {
    return "eleven";
  }

  const firstWord = title.split(/\s+/).find(Boolean);
  return firstWord || "eleven";
}

function buildParentDayPlanMessageReply(activeLocalCase = null, language = "Dansk") {
  const studentName = getLocalCaseDisplayName(activeLocalCase);

  if (language === "English") {
    return [
      "Here is a short copy-ready message for the parents:",
      "",
      "```text",
      "Hi",
      "",
      `We have made a simple visual day plan for ${studentName}, so the day becomes more predictable and easier to follow.`,
      "",
      "At school we use short steps and small icons, for example:",
      "👋 Arrive",
      "🎒 Unpack bag",
      "📚 Short task",
      "☕ Break",
      "📚 Work again",
      "🍽️ Lunch",
      "😌 Calm pause",
      "🏁 Finish the day",
      "",
      "It may help to use the same type of short steps at home:",
      "",
      "🏠 Morning:",
      "🛏️ Get up",
      "🦷 Brush teeth",
      "👕 Get dressed",
      "🥣 Breakfast",
      "🎒 Bag ready",
      "🚗 Leave for school",
      "",
      "🏠 After school/evening:",
      "🍎 Snack",
      "🎮 Screen time by agreement",
      "📚 Homework for a short time if agreed",
      "🛁 Bath / hygiene",
      "📖 Story or calm activity",
      "😴 Sleep",
      "",
      `The aim is not to control ${studentName}, but to make transitions clearer and reduce pressure during the day.`,
      "",
      "Kind regards",
      "[name]",
      "```",
    ].join("\n");
  }

  return [
    "Her er en kort kopierbar besked til forældrene:",
    "",
    "```text",
    "Hej",
    "",
    `Vi har lavet en enkel visuel dagsplan for ${studentName}, så dagen bliver mere tydelig og forudsigelig.`,
    "",
    "I skolen bruger vi korte trin og små ikoner, fx:",
    "👋 Kom ind",
    "🎒 Pakke ud",
    "📚 Kort opgave",
    "☕ Pause",
    "📚 Arbejde igen",
    "🍽️ Frokost",
    "😌 Rolig pause",
    "🏁 Afslutning",
    "",
    "Det kan måske hjælpe, hvis I bruger samme type korte trin hjemme:",
    "",
    "🏠 Morgen:",
    "🛏️ Stå op",
    "🦷 Børste tænder",
    "👕 Tøj på",
    "🥣 Morgenmad",
    "🎒 Taske klar",
    "🚗 Afsted til skole",
    "",
    "🏠 Efter skole/aften:",
    "🍎 Snack",
    "🎮 Skærmtid efter aftale",
    "📚 Lektier i kort tid, hvis det er aftalt",
    "🛁 Bad / hygiejne",
    "📖 Godnathistorie eller rolig aktivitet",
    "😴 Sove",
    "",
    `Formålet er ikke at styre ${studentName}, men at gøre skift mere overskuelige og mindske pres i løbet af dagen.`,
    "",
    "Venlig hilsen",
    "[navn]",
    "```",
  ].join("\n");
}


function getLocalTemplateRequest(message) {
  const fileTemplateResult = getTemplateFiles();
  const legacyTemplateResult = getTemplates();

  const fileTemplates = Array.isArray(fileTemplateResult?.templates)
    ? fileTemplateResult.templates
    : [];
  const legacyTemplates = Array.isArray(legacyTemplateResult?.templates)
    ? legacyTemplateResult.templates
    : [];

  // Det nye Markdown-register prioriteres. Den gamle skabelonbank bevares
  // som fallback, så eksisterende kommandoer fortsat virker.
  const templates = [...fileTemplates, ...legacyTemplates];

  const signals = getTemplateRequestSignals(message, templates);

  if (!signals.isTemplateRequest) {
    return null;
  }

  if (signals.listRequest) {
    return {
      type: "list",
      templates,
      total: templates.length,
    };
  }

  const bestMatch = findBestLocalTemplate(message, templates);

  if (!bestMatch) {
    return signals.indirectResourceRequest
      ? null
      : {
          type: "not_found",
          templates,
          total: templates.length,
        };
  }

  if (
    signals.indirectResourceRequest &&
    !signals.isDirectRequest &&
    (
      bestMatch.score < 50 ||
      bestMatch.matchedWords.length < 2
    )
  ) {
    return null;
  }

  return {
    type: "match",
    template: bestMatch.template,
    context: buildLocalTemplateContext(bestMatch.template),
    score: bestMatch.score,
    matchedFields: bestMatch.matchedFields,
    matchedWords: bestMatch.matchedWords,
    indirectResourceRequest:
      signals.indirectResourceRequest && !signals.isDirectRequest,
  };
}


function isStudentProfileRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  const blockedPatterns = [
    "pbl profil",
    "pbl profile",
    "projektprofil",
    "projekt profil",
  ];

  if (blockedPatterns.some((pattern) => text.includes(pattern))) {
    return false;
  }

  const profilePatterns = [
    "opret elevprofil",
    "lav elevprofil",
    "dan elevprofil",
    "udfyld elevprofil",
    "opret skoleprofil",
    "lav skoleprofil",
    "dan skoleprofil",
    "udfyld skoleprofil",
    "opret arbejdsprofil",
    "lav arbejdsprofil",
    "dan arbejdsprofil",
    "udfyld arbejdsprofil",
    "opret profil for",
    "lav profil for",
    "dan profil for",
    "udfyld profil for",
  ];

  return profilePatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}


function extractLabeledStudentProfileValue(message, labels = []) {
  const text = String(message || "");

  for (const label of labels) {
    const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`^\\s*${escapedLabel}\\s*:\\s*(.+?)\\s*$`, "im"));

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function extractStudentProfileRegistration(message) {
  return {
    elev_arbejdsnavn: extractLabeledStudentProfileValue(message, [
      "Navn / arbejdsnavn",
      "Elev / arbejdsnavn",
      "Elevnavn",
      "Navn",
    ]),
    klasse_gruppe: extractLabeledStudentProfileValue(message, [
      "Klasse / gruppe",
      "Klasse",
      "Gruppe",
    ]),
    oprettet_af_signatur: extractLabeledStudentProfileValue(message, [
      "Oprettet af / signatur",
      "Signatur",
      "Skrevet af",
    ]),
  };
}

function stripStudentProfileRegistrationLines(message) {
  return String(message || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) return true;

      return !/^(?:opret\s+elevprofil|navn\s*\/\s*arbejdsnavn|elev\s*\/\s*arbejdsnavn|elevnavn|klasse\s*\/\s*gruppe|oprettet\s+af\s*\/\s*signatur|inds[æa]t\s+elevcase\s+her)\s*:?/i.test(trimmed);
    })
    .join("\n")
    .replace(/\[\s*INDS[ÆA]T\s+ELEVCASE\s+HER\s*\]/gi, "")
    .trim();
}

function getStudentProfileSchema() {
  return {
    type: "object",
    properties: {
      elev_arbejdsnavn: { type: "string" },
      klasse_gruppe: { type: "string" },
      primaere_observationer: { type: "string" },
      laering_og_opgaver: { type: "string" },
      koncentration_udholdenhed: { type: "string" },
      socialt_samspil: { type: "string" },
      gruppearbejde: { type: "string" },
      skift_overgange: { type: "string" },
      belastninger_triggere: { type: "string" },
      det_der_virker: { type: "string" },
      det_der_boer_observeres: { type: "string" },
      keywords: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "elev_arbejdsnavn",
      "klasse_gruppe",
      "primaere_observationer",
      "laering_og_opgaver",
      "koncentration_udholdenhed",
      "socialt_samspil",
      "gruppearbejde",
      "skift_overgange",
      "belastninger_triggere",
      "det_der_virker",
      "det_der_boer_observeres",
      "keywords",
    ],
    additionalProperties: false,
  };
}

function formatStudentProfile(profile, language = "Dansk") {
  const missing = language === "English"
    ? "Not stated yet."
    : "Ikke oplyst endnu.";

  const cleanField = (value) => {
    const text = String(value || "").trim();
    return text || missing;
  };

  const keywords = Array.isArray(profile?.keywords)
    ? profile.keywords
        .map((keyword) => String(keyword || "").trim())
        .filter(Boolean)
    : [];

  const keywordText = keywords.length > 0
    ? keywords.join(", ")
    : missing;

  if (language === "English") {
    return [
      "## Student profile v1",
      "",
      `**Student / working name:** ${cleanField(profile?.elev_arbejdsnavn)}`,
      `**Class / group:** ${cleanField(profile?.klasse_gruppe)}`,
      `**Primary observations:** ${cleanField(profile?.primaere_observationer)}`,
      `**Learning and tasks:** ${cleanField(profile?.laering_og_opgaver)}`,
      `**Concentration / stamina:** ${cleanField(profile?.koncentration_udholdenhed)}`,
      `**Social interaction:** ${cleanField(profile?.socialt_samspil)}`,
      `**Group work:** ${cleanField(profile?.gruppearbejde)}`,
      `**Transitions:** ${cleanField(profile?.skift_overgange)}`,
      `**Load / triggers:** ${cleanField(profile?.belastninger_triggere)}`,
      `**What works:** ${cleanField(profile?.det_der_virker)}`,
      `**Should be observed:** ${cleanField(profile?.det_der_boer_observeres)}`,
      `**Keywords:** ${keywordText}`,
    ].join("\n\n");
  }

  return [
    "## Elevprofil v1",
    "",
    `**Elev / arbejdsnavn:** ${cleanField(profile?.elev_arbejdsnavn)}`,
    `**Klasse / gruppe:** ${cleanField(profile?.klasse_gruppe)}`,
    `**Primære observationer:** ${cleanField(profile?.primaere_observationer)}`,
    `**Læring og opgaver:** ${cleanField(profile?.laering_og_opgaver)}`,
    `**Koncentration / udholdenhed:** ${cleanField(profile?.koncentration_udholdenhed)}`,
    `**Socialt samspil:** ${cleanField(profile?.socialt_samspil)}`,
    `**Gruppearbejde:** ${cleanField(profile?.gruppearbejde)}`,
    `**Skift / overgange:** ${cleanField(profile?.skift_overgange)}`,
    `**Belastninger og triggere:** ${cleanField(profile?.belastninger_triggere)}`,
    `**Det der virker:** ${cleanField(profile?.det_der_virker)}`,
    `**Det der bør observeres:** ${cleanField(profile?.det_der_boer_observeres)}`,
    `**Keywords:** ${keywordText}`,
  ].join("\n\n");
}

async function createStudentProfileFromText(message, language = "Dansk") {
  const registration = extractStudentProfileRegistration(message);
  const studentCaseText = stripStudentProfileRegistrationLines(message);
  const missing = language === "English" ? "Not stated yet." : "Ikke oplyst endnu.";

  const instructions = [
    "Du er CDA Profilgenerator v1.",
    "Din eneste opgave er at udtrække en kort skolefaglig elevprofil fra lærerens fritekst.",
    "Profilen er arbejdsdata til skolebrug, ikke journal, ikke psykolograpport og ikke diagnosevurdering.",
    "Brug kun oplysninger, som læreren faktisk har givet, eller som er direkte skolefagligt afledt af teksten.",
    "Gæt ikke. Stil ikke diagnose. Skriv ikke lange forklaringer.",
    "Brug registreringsfelterne præcist som metadata. Ændr ikke navn eller klasse/gruppe.",
    "Hvis et felt mangler data, skriv præcist: Ikke oplyst endnu.",
    "Keywords skal være korte arbejdsnøgler udledt af elevcasen, ikke en fast liste.",
    "Keywords må ikke være hele sætninger.",
    "Hold hvert felt kort. Rene facts. Ingen fyldtekst.",
    language === "English"
      ? "Return content in English, but keep schema keys unchanged."
      : "Returnér indhold på dansk.",
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input: [
      "REGISTRERINGSFELTER:",
      `elev_arbejdsnavn: ${registration.elev_arbejdsnavn || missing}`,
      `klasse_gruppe: ${registration.klasse_gruppe || missing}`,
      "",
      "ELEVCASE:",
      studentCaseText || message,
      "",
      "Udtræk profilen i de faste felter. Navn og klasse/gruppe skal gengives præcist i de tilsvarende schemafelter.",
    ].join("\n"),
    max_output_tokens: 850,
    text: {
      format: {
        type: "json_schema",
        name: "cda_student_profile_v1",
        strict: true,
        schema: getStudentProfileSchema(),
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra profilgeneratoren");
  }

  const profile = JSON.parse(response.output_text || "{}");

  profile.elev_arbejdsnavn = registration.elev_arbejdsnavn || profile.elev_arbejdsnavn || missing;
  profile.klasse_gruppe = registration.klasse_gruppe || profile.klasse_gruppe || missing;

  return {
    profile,
    response,
    reply: formatStudentProfile(profile, language),
  };
}



function isReadableStudentProfileRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  if (isStudentProfileRequest(message)) {
    return false;
  }

  const profileTextPatterns = [
    "vis profil",
    "vis elevprofil",
    "vis skoleprofil",
    "vis arbejdsprofil",
    "laesbar profil",
    "laesbar elevprofil",
    "laesbar skoleprofil",
    "laesbar tekst",
    "skriv profil",
    "skriv elevprofil",
    "skriv skoleprofil",
    "omskriv profil",
    "omskriv elevprofil",
    "lav profiltekst",
    "lav laesbar profil",
    "lav laesbar elevprofil",
    "lav laesbar tekst",
    "kort laererprofil",
    "tekst til teammode",
    "notat til teammode",
    "teamnotat",
    "notat til ppr",
    "kort notat til ppr",
  ];

  const developmentPatterns = [
    "udviklingsstatus",
    "mulig udvikling",
    "mulige udvikling",
    "progression",
    "udvikling over tid",
    "kort udvikling",
    "status for udvikling",
    "hvad er naeste skridt",
    "naeste skridt ud fra profilen",
  ];

  return [...profileTextPatterns, ...developmentPatterns].some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}

function getReadableStudentProfileIntent(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (
    [
      "udviklingsstatus",
      "mulig udvikling",
      "mulige udvikling",
      "progression",
      "udvikling over tid",
      "kort udvikling",
      "status for udvikling",
      "hvad er naeste skridt",
      "naeste skridt ud fra profilen",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "development_status";
  }

  if (
    [
      "team",
      "teammode",
      "teamnotat",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "team_note";
  }

  if (
    [
      "ppr",
      "notat til ppr",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "ppr_note";
  }

  return "readable_profile";
}

async function createReadableStudentProfileText(message, language = "Dansk") {
  const intent = getReadableStudentProfileIntent(message);

  const intentRules = {
    readable_profile: "Skriv en kort læsbar lærerprofil i 2-4 korte afsnit.",
    development_status: "Skriv en kort udviklingsstatus med: aktuelt billede, det der virker, muligt næste skolefaglige fokus. Skriv kun mulig udvikling ud fra data, ikke løfter.",
    team_note: "Skriv et kort teamnotat, som flere lærere/vikarer kan bruge som fælles arbejdsgrundlag.",
    ppr_note: "Skriv et kort neutralt PPR-egnet arbejdsnotat uden diagnosekonklusioner.",
  };

  const instructions = [
    "Du er CDA Profiltekst v1.",
    "Din eneste opgave er at omskrive en eksisterende elevprofil, keyword-profil eller skolefaglige nøgledata til en kort, læsbar tekst.",
    "Du må ikke oprette en ny 12-felts profil her. Du skal skrive menneskesprog ud fra de oplysninger, brugeren giver.",
    "Skriv skolefagligt, konkret og neutralt.",
    "Brug kun oplysninger, der står i brugerens tekst. Gæt ikke. Opfind ikke progression.",
    "Ingen diagnosekonklusioner. Ingen psykolograpport. Ingen lange forklaringer.",
    "Undgå 'hvis eleven...' når data allerede siger, hvad der sker. Skriv konkret.",
    "Hvis der mangler vigtige oplysninger, nævn det kort til sidst under 'Mangler at afklare'. Hvis der ikke mangler noget tydeligt, må du ikke skrive 'Ingen', 'Intet' eller lignende. Udelad i stedet hele afsnittet.",
    "Hold svaret kort og brugbart for lærerteamet.",
    intentRules[intent] || intentRules.readable_profile,
    language === "English"
      ? "Write in English."
      : "Skriv på dansk.",
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input: [
      "BRUGERENS ØNSKE OG PROFILDATA:",
      message,
      "",
      "Omskriv til kort, læsbar skolefaglig tekst.",
    ].join("\n"),
    max_output_tokens: 850,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra profiltekst-generatoren");
  }

  return {
    intent,
    response,
    reply: String(response.output_text || "").trim(),
  };
}


const tools = [
  {
    type: "function",
    name: "getPromptRules",
    description:
      "Henter dynamiske prompt-regler til CDA. response_style_rules, mode_switch_rules, source_priority_rules, general_rule og practice_situations er allerede indlæst og skal ikke hentes igen. Øvrige tilgængelige sektioner: domain_scope, specialist_trigger_rules, template_trigger_rules, case_trigger_rules, diagnosis_trigger_rules, roleplay_rules, emotion_trigger_rules, bornehave_trigger_rules, cda_training_rules, roleplay_learning_rules, action_rules, roleplay_emotion_rules, conflict_mediator_rules, comorbidity_rules, school_home_dialogue_rules. Hent den sektion der matcher situationen, fx comorbidity_rules ved mulig komorbiditet, school_home_dialogue_rules ved skole-hjem-kommunikation, eller specialist_trigger_rules/template_trigger_rules før specialister eller skabeloner bruges.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Præcist sektionsnavn fra listen ovenfor, fx comorbidity_rules, source_priority_rules eller conflict_mediator_rules.",
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
    "Henter eksisterende, faste CDA-rollespilsscenarier (kun et par stykker – et lille referencebibliotek, ikke selve rollespilsmotoren). Kald KUN dette værktøj, når brugeren tydeligt vil browse eller genbruge et eksisterende, navngivet scenarie, eller har givet en konkret nok situation til at der er noget at matche mod. Hvis brugerens ønske om rollespil er uklart, generelt eller kun nævner selve funktionen (fx 'rollespil', 'rollespilsmotor', 'vis mig rollespil'), skal du IKKE kalde dette værktøj — spørg i stedet kort, hvilken indgang brugeren vil bruge (kør en hændelse / træn en situation / øv en samtale), jf. roleplay_learning_rules. De fleste rollespil bygges bedst direkte ud fra brugerens egen beskrivelse, ikke ud fra dette lille bibliotek.",
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

function getPblProfileTemplate() {
  return [
    "Udfyld kort det, du ved. Du behøver ikke have svar på alt:",
    "",
    "1. Alder og klassetrin:",
    "2. Interesser og det eleven selv opsøger:",
    "3. Praktiske, kreative eller faglige styrker:",
    "4. Hvor længe kan eleven typisk holde fokus?",
    "5. Behov for struktur, pauser og bevægelse:",
    "6. Arbejder eleven bedst alene, med én eller i en lille gruppe?",
    "7. Sanser eller belastninger, vi skal tage hensyn til:",
    "8. Modenhed og sikkerhed ved materialer eller værktøj:",
    "9. Hvor meget voksenstøtte kræves?",
    "10. Hvilket fagligt mål skal projektet støtte?",
    "11. Hvad er allerede prøvet, og hvad virkede eller virkede ikke?",
    "12. Din vurdering: Er PBL relevant nu — ja, nej eller usikkert?"
  ].join("\n");
}

function extractPendingAction(replyText) {
  const pblMarker = "[[PENDING_ACTION:PBL_PROFILE]]";
  const roleplayMarker = "[[PENDING_ACTION:ROLEPLAY_ACTIVE]]";
  const text = String(replyText || "");

  if (text.includes(pblMarker)) {
    return {
      reply: text.replace(pblMarker, "").trim(),
      pendingAction: "pbl_profile",
    };
  }

  if (text.includes(roleplayMarker)) {
    return {
      reply: text.replace(roleplayMarker, "").trim(),
      pendingAction: "roleplay_active",
    };
  }

  return {
    reply: text.trim(),
    pendingAction: null,
  };
}


function encodePblChoiceState(data) {
  return `pbl_choice:${Buffer.from(
    JSON.stringify(data),
    "utf8"
  ).toString("base64url")}`;
}

function decodePblChoiceState(value) {
  const text = String(value || "");

  if (!text.startsWith("pbl_choice:")) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(
        text.slice("pbl_choice:".length),
        "base64url"
      ).toString("utf8")
    );
  } catch {
    return null;
  }
}

function getPblProjectById(projectId) {
  const result = getPblProjects({ id: projectId });
  return result?.project || null;
}

function extractProfileField(profileText, fieldNumber) {
  const profileLabels = {
    1: "Alder og klassetrin:",
    2: "Interesser og det eleven selv opsøger:",
    3: "Praktiske, kreative eller faglige styrker:",
    4: "Hvor længe kan eleven typisk holde fokus?",
    5: "Behov for struktur, pauser og bevægelse:",
    6: "Arbejder eleven bedst alene, med én eller i en lille gruppe?",
    7: "Sanser eller belastninger, vi skal tage hensyn til:",
    8: "Modenhed og sikkerhed ved materialer eller værktøj:",
    9: "Hvor meget voksenstøtte kræves?",
    10: "Hvilket fagligt mål skal projektet støtte?",
    11: "Hvad er allerede prøvet, og hvad virkede eller virkede ikke?",
    12: "Din vurdering: Er PBL relevant nu — ja, nej eller usikkert?",
  };

  const label = profileLabels[fieldNumber];

  if (!label) {
    return "";
  }

  const escapeRegExp = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const currentMarker =
    `(?:^|\\s)${fieldNumber}\\.\\s*${escapeRegExp(label)}\\s*:?\\s*`;

  const nextLabel = profileLabels[fieldNumber + 1];
  const nextMarker = nextLabel
    ? `(?=\\s+${fieldNumber + 1}\\.\\s*${escapeRegExp(nextLabel)}\\s*:?)`
    : "$";

  const match = String(profileText || "").match(
    new RegExp(`${currentMarker}([\\s\\S]*?)${nextMarker}`, "i")
  );

  return match ? match[1].trim() : "";
}

function getPblProjectsForDynamicAssessment() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_PBL_Projects.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_PBL_Projects.json blev ikke fundet"
  );

  const projects = Array.isArray(data.projects)
    ? data.projects
    : [];

  const cleanIndexValue = (value, maxLength = null) => {
    const cleaned = String(value || "")
      .replace(/[|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return Number.isInteger(maxLength)
      ? cleaned.slice(0, maxLength)
      : cleaned;
  };

  const compactList = (value, limit = null) => {
    const items = Array.isArray(value) ? value : [];
    const selected = Number.isInteger(limit)
      ? items.slice(0, limit)
      : items;

    return selected
      .map((item) => cleanIndexValue(item))
      .filter(Boolean)
      .join(",");
  };

  const codeValue = (value, codes) => {
    const normalized = String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return codes[normalized] || cleanIndexValue(value);
  };

  const rows = projects.map((project) => [
    cleanIndexValue(project.id),
    cleanIndexValue(project.title),
    cleanIndexValue(project.description, 60),
    compactList(project.competencies, 2),
    compactList(project.diagnosis_match),
    compactList(project.stimuli_type),
    codeValue(project.social_exposure, {
      lav: "L",
      moderat: "M",
      gruppe: "G",
    }),
    codeValue(project.structure_need, {
      lav: "L",
      moderat: "M",
      hoj: "H",
    }),
    codeValue(project.level, {
      junior: "J",
      intermediate: "I",
      advanced: "A",
    }),
  ].join("|"));

  return {
    version: data.version || null,
    projectCount: projects.length,
    indexText: [
      `VERSION:${cleanIndexValue(data.version)}`,
      "KOLONNER:id|titel|kort tema|kompetencer|diagnosematch|stimuli|social|struktur|niveau",
      "KODER:social L=lav M=moderat G=gruppe; struktur L=lav M=moderat H=høj; niveau J=junior I=intermediate A=advanced",
      ...rows,
    ].join("\n"),
  };
}

async function assessPblProfileDynamically(profileText) {
  const projectData = getPblProjectsForDynamicAssessment();

  const instructions = [
    "Du er CDA's dynamiske PBL-fagmotor.",
    "Foretag en samlet faglig vurdering af elevprofilen og det kompakte projektindex.",
    "Brug ingen point, vægte, faste særord, skjult facitliste eller diagnose som automatisk konklusion.",
    "Vurder især elevens egeninteresse, koncentration, arbejdsform, alder og modenhed, sikkerhed, støttebehov, social belastning, faglige mål og mulighed for realistiske microsteps.",
    "Et direkte interessematch er vigtigt, men skal altid vurderes sammen med resten af profilen.",
    "Vælg kun projekt-id'er, der findes i det vedlagte projektindex.",
    "Vælg to forskellige eksisterende projekter, hvis begge er reelt fagligt egnede.",
    "Hvis projektindexet ikke indeholder to forsvarlige muligheder, skal status være no_suitable_match. Vælg ikke et tilfældigt projekt for at udfylde felterne.",
    "Begrundelserne skal være korte, konkrete og baseret på både elevprofilen og projektdata.",
    "CDA foreslår. Læreren guider. Eleven vælger med.",
  ].join("\n");

  const projectIndex = projectData.indexText;

  const input = [
    "ELEVPROFIL:",
    profileText,
    "",
    "KOMPAKT PBL-PROJEKTINDEX:",
    projectIndex,
  ].join("\n");

  console.log("CDA PBL inputmåling:", {
    project_count: projectData.projectCount,
    profile_chars: profileText.length,
    profile_bytes: Buffer.byteLength(profileText, "utf8"),
    instructions_chars: instructions.length,
    instructions_bytes: Buffer.byteLength(instructions, "utf8"),
    project_index_chars: projectIndex.length,
    project_index_bytes: Buffer.byteLength(projectIndex, "utf8"),
    complete_input_chars: input.length,
    complete_input_bytes: Buffer.byteLength(input, "utf8"),
  });

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input,
    max_output_tokens: 700,
    text: {
      format: {
        type: "json_schema",
        name: "cda_pbl_assessment",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["matched", "no_suitable_match"],
            },
            first_id: {
              type: "string",
            },
            second_id: {
              type: "string",
            },
            first_reason: {
              type: "string",
            },
            second_reason: {
              type: "string",
            },
            no_match_reason: {
              type: "string",
            },
          },
          required: [
            "status",
            "first_id",
            "second_id",
            "first_reason",
            "second_reason",
            "no_match_reason",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændig dynamisk PBL-vurdering");
  }

  const assessment = JSON.parse(response.output_text || "{}");

  if (assessment.status === "no_suitable_match") {
    return {
      assessment,
      response,
      first: null,
      second: null,
    };
  }

  const first = getPblProjectById(assessment.first_id);
  const second = getPblProjectById(assessment.second_id);

  if (
    !first ||
    !second ||
    String(first.id) === String(second.id)
  ) {
    throw new Error(
      "PBL-fagmotoren returnerede ugyldige eller ens projektvalg"
    );
  }

  return {
    assessment,
    response,
    first,
    second,
  };
}

function getStructuredPblProfile(profileText) {
  return {
    age_and_grade: extractProfileField(profileText, 1),
    interests: extractProfileField(profileText, 2),
    strengths: extractProfileField(profileText, 3),
    focus: extractProfileField(profileText, 4),
    structure_and_breaks: extractProfileField(profileText, 5),
    work_form: extractProfileField(profileText, 6),
    sensory_load: extractProfileField(profileText, 7),
    safety_and_maturity: extractProfileField(profileText, 8),
    adult_support: extractProfileField(profileText, 9),
    learning_goals: extractProfileField(profileText, 10),
    previous_attempts: extractProfileField(profileText, 11),
    pbl_relevance: extractProfileField(profileText, 12),
  };
}

async function createTailoredPblProject(
  profileText,
  rejectedProjects = []
) {
  const profile = getStructuredPblProfile(profileText);

  const rejected = rejectedProjects
    .filter(Boolean)
    .map((project) => ({
      id: project.id || null,
      title: project.title || null,
      subtitle: project.subtitle || null,
    }));

  const compactProfile = Object.fromEntries(
    Object.entries({
      age: profile.age_and_grade,
      interests: profile.interests,
      strengths: profile.strengths,
      focus: profile.focus,
      structure: profile.structure_and_breaks,
      work_form: profile.work_form,
      sensory_load: profile.sensory_load,
      safety: profile.safety_and_maturity,
      adult_support: profile.adult_support,
      learning_goals: profile.learning_goals,
      previous_attempts: profile.previous_attempts,
      pbl_relevance: profile.pbl_relevance,
    }).filter(([, value]) => String(value || "").trim())
  );

  const instructions = [
    "Du er CDA's dynamiske PBL-fagmotor.",
    "Begge eksisterende forslag er afvist.",
    "Skab ét nyt og tydeligt anderledes PBL-projekt ud fra elevprofilen som helhed.",
    "Brug ingen point, vægte, særord eller skjult facitliste.",
    "Tag hensyn til interesse, koncentration, arbejdsform, alder, sikkerhed, støttebehov, social belastning og faglige mål.",
    "Projektet skal kunne gennemføres i korte microsteps og give eleven medejerskab.",
    "Hold titel og tekstfelter korte. Skriv præcis 3 aktiviteter og 3 microsteps. Hvert listepunkt må højst være 12 ord.",
  ].join("\n");

  const input = JSON.stringify({
    profile: compactProfile,
    rejected_projects: rejected.map((project) => ({
      id: project.id,
      title: project.title,
    })),
  });

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input,
    max_output_tokens: 850,
    text: {
      format: {
        type: "json_schema",
        name: "cda_tailored_pbl_project",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            subtitle: { type: "string" },
            description: { type: "string" },
            why_it_fits: { type: "string" },
            activities: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
            microsteps: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: [
            "title",
            "subtitle",
            "description",
            "why_it_fits",
            "activities",
            "microsteps",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    console.error("CDA tilpasset PBL-kald ufuldstændigt:", {
      status: response.status,
      incomplete_details: response.incomplete_details || null,
      output_item_types: Array.isArray(response.output)
        ? response.output.map((item) => item.type || null)
        : [],
      output_text_length: String(response.output_text || "").length,
      usage: response.usage || null,
    });

    throw new Error("Ufuldstændigt tilpasset PBL-projekt");
  }

  const generatedProject = JSON.parse(
    response.output_text || "{}"
  );

  return {
    project: {
      ...generatedProject,
      learning_integration: profile.learning_goals,
      safety_framework: profile.safety_and_maturity,
      adult_support: profile.adult_support,
    },
    response,
  };
}

function formatTailoredPblProject(project) {
  const activities = (project.activities || [])
    .map((item) => `- ${item}`)
    .join("\n");

  const microsteps = (project.microsteps || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return [
    `**Nyt tilpasset projekt: ${project.title}**`,
    project.subtitle ? `*${project.subtitle}*` : "",
    "",
    project.description || "",
    project.why_it_fits
      ? `\n**Hvorfor det passer:** ${project.why_it_fits}`
      : "",
    "",
    activities ? `Projektet kan begynde med:\n${activities}` : "",
    microsteps ? `\nFørste microsteps:\n${microsteps}` : "",
    project.learning_integration
      ? `\nDe faglige mål indbygges sådan: ${project.learning_integration}`
      : "",
    project.safety_framework
      ? `\nSikkerhedsramme: ${project.safety_framework}`
      : "",
    project.adult_support
      ? `\nVoksenstøtte: ${project.adult_support}`
      : "",
    "",
    "Projektet er skabt ud fra elevprofilen, men læreren og eleven skal stadig tilpasse og vælge det sammen.",
  ].filter(Boolean).join("\n");
}

function formatPblChoice(project, choiceNumber, profileText, reason = "") {
  const learningGoals = extractProfileField(profileText, 10);
  const safety = extractProfileField(profileText, 8);

  const activities = (project.activities || [])
    .slice(0, 3)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    `**Forslag ${choiceNumber}: ${project.title}**`,
    project.subtitle ? `*${project.subtitle}*` : "",
    "",
    project.description || "",
    reason ? `\n**Hvorfor det passer:** ${reason}` : "",
    "",
    activities ? `Projektet kan begynde med:\n${activities}` : "",
    learningGoals
      ? `\nDe faglige mål kan indbygges sådan: ${learningGoals}`
      : "",
    safety
      ? `\nSikkerhedsramme: ${safety}`
      : "",
    "",
    "Det er et forslag, ikke en beslutning. Tal med eleven om, hvad der virker spændende ved projektet.",
    choiceNumber === 1
      ? "Vil I vælge dette projekt, se forslag 2 eller tale om projektet først?"
      : "Vil I vælge dette projekt, gå tilbage til forslag 1 eller have CDA til at skabe et nyt projekt sammen med jer?"
  ].filter(Boolean).join("\n");
}


function isDirectPblLibraryRequest(message) {
  const text = normalizeReplyIntent(message);

  return (
    /\bpbl[_ -]?\d+\b/i.test(String(message || "")) ||
    text.includes("projektbank") ||
    text.includes("projekt bibliotek") ||
    text.includes("projektbibliotek") ||
    text.includes("vis projektet") ||
    text.includes("hent projektet") ||
    text.includes("bike repair workshop")
  );
}

function isConcreteStudentPblRequest(message) {
  const text = normalizeReplyIntent(message);

  const mentionsStudent = [
    "elev",
    "barn",
    "dreng",
    "pige",
    "han",
    "hun"
  ].some((word) => text.includes(word));

  const requestsProject = [
    "pbl",
    "projektbaseret laering",
    "projektbaseret læring",
    "foresla et projekt",
    "foreslå et projekt",
    "find et projekt",
    "lav et projekt"
  ].some((phrase) => text.includes(phrase));

  return (
    mentionsStudent &&
    requestsProject &&
    !isDirectPblLibraryRequest(message)
  );
}


function extractBornehaveAge(message) {
  const match = String(message || "").match(
    /\b([3-6])\s*(?:år|aar)\b/i
  );

  return match ? Number(match[1]) : null;
}

function isBornehavePracticeRequest(message) {
  const text = normalizeDiagnosisPhrase(message);
  const age = extractBornehaveAge(message);

  const contextPatterns = [
    "bornehave",
    "bornehavebarn",
    "daginstitution",
    "paedagog",
    "paedagogmedhjaelper",
    "paedagogisk assistent",
    "foerskole",
    "skolestart",
    "0 klasse",
    "bornehaveklasse",
    "brobygning",
    "aflevering",
    "stue",
  ];

  const childPatterns = ["barn", "dreng", "pige"];
  const hasExplicitContext = contextPatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
  const hasAgeContext =
    age !== null &&
    childPatterns.some((pattern) =>
      containsDiagnosisPhrase(text, pattern)
    );

  if (!hasExplicitContext && !hasAgeContext) {
    return false;
  }

  const excludedPatterns = [
    "vis en case",
    "find en case",
    "case om",
    "case med",
    "hvad gjorde andre",
    "hvad har andre gjort",
    "har andre provet",
    "pbl",
    "projektbaseret laering",
    "find et projekt",
    "lav et projekt",
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "rollespil",
    "rolleleg",
    "perspektivskifte",
    "lav et skema",
    "lav en skabelon",
    "vis en skabelon",
    "udfyld en skabelon",
    "lav en overlevering",
    "udfyld en overlevering",
    "komorbiditet",
    "kan der vaere andet end",
    "kan der vare andet end",
  ];

  if (
    excludedPatterns.some((pattern) =>
      text.includes(normalizeDiagnosisPhrase(pattern))
    )
  ) {
    return false;
  }

  const startsAsDiagnosisDefinition = [
    "hvad er",
    "forklar diagnosen",
    "definition",
    "what is",
    "explain",
  ].some((pattern) =>
    text.startsWith(normalizeDiagnosisPhrase(pattern))
  );

  if (
    startsAsDiagnosisDefinition &&
    findStructuredDiagnosisMatches(message).length === 1
  ) {
    return false;
  }

  return true;
}

function compactBornehaveTemplate(template) {
  if (!template) return null;

  const templateData = template.content || {};
  const content = templateData.content || {};

  return {
    id: template.id || templateData.id || null,
    title: template.title || templateData.title || null,
    category: template.category || templateData.category || null,
    role: template.role || null,
    purpose: content.purpose || null,
    description: content.description || null,
    principles: Array.isArray(content.principles)
      ? content.principles
      : [],
    use_cases: Array.isArray(content.use_cases)
      ? content.use_cases
      : [],
    practice_template: content.template_markdown || null,
  };
}

function buildBornehavePracticeContext(routing) {
  const templates = [];
  const primary = compactBornehaveTemplate(
    routing?.primary_template_object
  );

  if (primary) {
    templates.push(primary);
  }

  if (
    routing?.handover_ready &&
    routing?.handover_template &&
    routing.handover_template !== routing.primary_template
  ) {
    const handoverObject = (
      Array.isArray(routing?.flow_template_objects)
        ? routing.flow_template_objects
        : []
    ).find(
      (template) => template.id === routing.handover_template
    );

    const handover = compactBornehaveTemplate(handoverObject);

    if (handover) {
      templates.push(handover);
    }
  }

  return {
    module: routing?.module || "CDA_Bornehavespor",
    version: routing?.version || null,
    age: routing?.age || null,
    matched_behavior_tags: Array.isArray(
      routing?.matched_behavior_tags
    )
      ? routing.matched_behavior_tags
      : [],
    primary_template: routing?.primary_template || null,
    handover_ready: Boolean(routing?.handover_ready),
    templates,
    practice_knowledge: routing?.practice_knowledge || null,
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
    "rollespil",
    "rolleleg",
    "perspektivskifte",
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


function compactContextValue(value, maxLength = 900) {
  if (value === null || value === undefined) return "";

  const text = Array.isArray(value)
    ? value.map((item) => compactContextValue(item, maxLength)).filter(Boolean).join("; ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeUsedDataSources(value) {
  if (!value) return [];

  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "object"
      ? Object.entries(value).map(([key, item]) => ({ key, item }))
      : [value];

  return rawItems
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        return compactContextValue(item, 160);
      }

      if (typeof item === "object") {
        const type = compactContextValue(item.type || item.source || item.key || "data", 60);
        const id = compactContextValue(item.id || item.name || item.item || item.file || item.primary || "", 120);
        const status = compactContextValue(item.status || item.note || "", 120);
        return [type, id, status].filter(Boolean).join(": ");
      }

      return compactContextValue(item, 160);
    })
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeActiveCaseContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = compactContextValue(
    value.summary || value.active_case_summary || value.case_summary || "",
    1100
  );

  const lastUserMessage = compactContextValue(
    value.last_user_message || value.lastUserMessage || "",
    700
  );

  const lastHeidiReply = compactContextValue(
    value.last_heidi_reply || value.lastHeidiReply || value.last_assistant_reply || "",
    900
  );

  const knownContext = compactContextValue(
    value.known_context || value.knownContext || "",
    900
  );

  const lastGuidanceSummary = compactContextValue(
    value.last_guidance_summary || value.lastGuidanceSummary || "",
    900
  );

  const openQuestionOrNextStep = compactContextValue(
    value.open_question_or_next_step || value.next_step || value.openQuestionOrNextStep || "",
    450
  );

  const conversationMode = compactContextValue(
    value.conversation_mode || value.mode || "heidi_case",
    80
  ) || "heidi_case";

  const usedDataSources = normalizeUsedDataSources(
    value.used_data_sources || value.usedDataSources || []
  );

  if (
    !summary &&
    !lastUserMessage &&
    !lastHeidiReply &&
    !knownContext &&
    !lastGuidanceSummary &&
    usedDataSources.length === 0
  ) {
    return null;
  }

  return {
    active: value.active !== false,
    conversation_mode: conversationMode,
    summary,
    known_context: knownContext,
    last_user_message: lastUserMessage,
    last_heidi_reply: lastHeidiReply,
    last_guidance_summary: lastGuidanceSummary,
    used_data_sources: usedDataSources,
    open_question_or_next_step: openQuestionOrNextStep,
  };
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

function isShortContinuationRequest(message) {
  const text = normalizeReplyIntent(message);

  const exactContinuations = [
    "uddyb",
    "forklar mere",
    "mere",
    "gør det dybere",
    "gor det dybere",
    "skriv samme svar længere",
    "skriv samme svar laengere",
    "hvorfor",
    "hvorfor virker det",
    "hvad mener du",
    "det virkede ikke",
    "det virker ikke",
    "hvad nu",
    "hvad gør jeg så",
    "hvad gor jeg sa",
    "fortsæt",
    "fortsaet",
  ];

  if (exactContinuations.includes(text)) return true;

  return text.length <= 80 && [
    "uddyb",
    "forklar",
    "samme sag",
    "det virkede ikke",
    "det virker ikke",
    "hvad nu",
  ].some((pattern) => text.includes(pattern));
}

function buildActiveCaseContextBlock(context) {
  if (!hasActiveCaseContext(context)) return "";

  const lines = [
    "AKTIV HEIDI-SAG",
    "Denne kontekst kommer fra samme igangværende samtale. Brug den kun som arbejdshukommelse, ikke som journal eller endelig konklusion.",
    `conversation_mode: ${context.conversation_mode}`,
  ];

  if (context.summary) lines.push(`active_case_summary: ${context.summary}`);
  if (context.known_context) lines.push(`known_context: ${context.known_context}`);
  if (context.last_user_message) lines.push(`last_user_message: ${context.last_user_message}`);
  if (context.last_heidi_reply) lines.push(`last_heidi_reply: ${context.last_heidi_reply}`);
  if (context.last_guidance_summary) lines.push(`last_guidance_summary: ${context.last_guidance_summary}`);
  if (context.used_data_sources.length > 0) {
    lines.push(`used_data_sources: ${context.used_data_sources.join(" | ")}`);
  }
  if (context.open_question_or_next_step) {
    lines.push(`open_question_or_next_step: ${context.open_question_or_next_step}`);
  }

  return lines.join("\n");
}

function buildActiveCaseInstructions(context, message) {
  if (!hasActiveCaseContext(context)) return "";

  const continuation = isShortContinuationRequest(message);
  const specialistAngle = isDirectSpecialistPanelRequest(message);

  return [
    "AKTIV SAGSHUKOMMELSE",
    "Brug active_case_context til at holde samme barn/situation åben på tværs af beskeder.",
    "Korte opfølgninger som 'uddyb', 'forklar mere', 'hvad nu' eller 'det virkede ikke' handler som udgangspunkt om samme aktive sag.",
    "Hvis brugeren spørger 'hvad siger psykologen?', 'hvad siger PPR?' eller lignende, skal du give en faglig specialistvinkel på samme aktive sag — ikke bede om en ekstern psykolograpport, medmindre brugeren specifikt henviser til en konkret rapport.",
    "Gentag ikke lokale dataopslag, hvis used_data_sources allerede viser, at samme spor er dækket, medmindre brugerens nye besked åbner et reelt nyt fagligt spor.",
    "Ved 'uddyb' skal du uddybe samme sag og samme råd, ikke spørge hvad der skal uddybes.",
    continuation ? "DEN NYE BESKED ER EN FORTSÆTTELSE AF SAMME SAG." : "",
    specialistAngle ? "DEN NYE BESKED BEDER OM SPECIALISTVINKEL PÅ SAMME SAG." : "",
  ].filter(Boolean).join("\n");
}

function buildContextualInput(message, context) {
  const contextBlock = buildActiveCaseContextBlock(context);

  if (!contextBlock) return message;

  return [
    contextBlock,
    "",
    "BRUGERENS NYE BESKED:",
    message,
  ].join("\n");
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
  language = "Dansk",
  role = "Lærer",
  response_style = "Mellem",
  adgangskode,
  pending_action = null,
  active_case_context = null,
} = req.body || {};

if (!message || typeof message !== "string") {
  return res.status(400).json({
    error: "Feltet message mangler",
  });
}

const allowedLanguages = ["Dansk", "English"];
const allowedRoles = ["Lærer", "Pædagog", "Forælder", "Specialist", "Andet"];
const allowedResponseStyles = ["Kort", "Mellem", "Dyb"];

if (!allowedLanguages.includes(language)) {
  return res.status(400).json({
    error: "language skal være Dansk eller English",
  });
}

if (!allowedRoles.includes(role)) {
  return res.status(400).json({
    error: "role skal være Lærer, Pædagog, Forælder, Specialist eller Andet",
  });
}

if (!allowedResponseStyles.includes(response_style)) {
  return res.status(400).json({
    error: "response_style skal være Kort, Mellem eller Dyb",
  });
}

const languageInstruction =
  language === "English"
    ? "Answer in English unless the user clearly asks for another language."
    : "Svar på dansk, medmindre brugeren tydeligt beder om et andet sprog.";

const roleInstructions = {
  Lærer:
    "Tilpas svaret til en lærer: fokusér på forståelse, klassepraksis, observation og realistiske handlinger i skoledagen.",
  Pædagog:
    "Tilpas svaret til en pædagog: fokusér på observation, relationer, miljø, struktur og realistiske pædagogiske handlinger. Antag ikke automatisk børnehave; lad brugerens konkrete spørgsmål afgøre, om konteksten er dagtilbud, SFO, skole eller andet.",
  Forælder:
    "Tilpas svaret til en forælder: fokusér på observationer i hverdagen, støtte hjemme og samarbejde med skole eller relevante fagpersoner.",
  Specialist:
    "Tilpas svaret til en psykolog, PPR-medarbejder, skolekonsulent eller anden specialist. Brug specialistfagligt sprog og fokusér på bærende mønstre, foreløbige faglige hypoteser, datamangler, kontekstforskelle, relevante observationer og næste faglige skridt. Skeln tydeligt mellem observation, hypotese og konklusion. Giv ikke almindelige lærer- eller forældreråd, medmindre specialisten direkte beder om konkrete tiltag til skole eller hjem. Udfør ikke en fuld Analyse-vurdering og stil ikke diagnose.",
  Andet:
    "Tilpas svaret til den konkrete situation uden at antage, at brugeren er lærer, forælder eller specialist.",
};

const audienceInstructions = [
  `AKTUELT SPROG: ${language}`,
  languageInstruction,
  `AKTUEL ROLLE: ${role}`,
  roleInstructions[role],
].join("\n");

const activeCaseContext = sanitizeActiveCaseContext(active_case_context);
const activeCaseInstructions = buildActiveCaseInstructions(activeCaseContext, message);
const contextualInput = buildContextualInput(message, activeCaseContext);

try {
  const localDiagnosisTheoryMeta = getSingleStructuredDiagnosisMatch(message);

  if (
    localDiagnosisTheoryMeta &&
    isLocalDiagnosisTheoryRequest(message) &&
    !isConcreteKnownDiagnosisCase(message)
  ) {
    const structuredDiagnosis = loadStructuredDiagnosis(
      localDiagnosisTheoryMeta
    );

    const reply = buildLocalDiagnosisTheoryReply(
      structuredDiagnosis,
      message,
      role,
      response_style
    );

    const usedTools = ["localDiagnosisTheoryRouting"];
    const toolDebug = [
      {
        name: "localDiagnosisTheoryRouting",
        diagnosis_id: localDiagnosisTheoryMeta.id,
        diagnosis_file: localDiagnosisTheoryMeta.fil,
        role,
        response_style,
        token_policy: "0_tokens_local_response",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: `local_diagnosis_theory:${localDiagnosisTheoryMeta.id}`,
    });
  }

  const localDiagnosisSessionMeta = getLocalDiagnosisSessionMeta(pending_action);

  if (localDiagnosisSessionMeta && isLocalDiagnosisStop(message)) {
    return res.status(200).json({
      success: true,
      reply: "Du er ude af lokal diagnoseteori. Skriv en ny situation, case, PBL, rollespil eller et nyt diagnoseområde.",
      model: "local",
      tools_used: ["localDiagnosisTheorySession"],
      tool_debug: [
        {
          name: "localDiagnosisTheorySession",
          action: "stop",
          previous_diagnosis_id: localDiagnosisSessionMeta.id,
          token_policy: "0_tokens_local_response",
        },
      ],
      pending_action: null,
    });
  }

  if (localDiagnosisSessionMeta && isLocalDiagnosisTheoryFollowup(message)) {
    const structuredDiagnosis = loadStructuredDiagnosis(localDiagnosisSessionMeta);
    const sessionPrompt = buildLocalDiagnosisSessionPrompt(localDiagnosisSessionMeta, message);
    const reply = buildLocalDiagnosisTheoryReply(
      structuredDiagnosis,
      sessionPrompt,
      role,
      response_style
    );

    const usedTools = ["localDiagnosisTheorySession"];
    const toolDebug = [
      {
        name: "localDiagnosisTheorySession",
        diagnosis_id: localDiagnosisSessionMeta.id,
        diagnosis_file: localDiagnosisSessionMeta.fil,
        followup: message,
        role,
        response_style,
        token_policy: "0_tokens_local_response",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: `local_diagnosis_theory:${localDiagnosisSessionMeta.id}`,
    });
  }

  const activeLocalCaseBeforeDirectCaseSearch = resolveActiveLocalCase(pending_action, activeCaseContext);

  if (activeLocalCaseBeforeDirectCaseSearch && isReturnToActiveCaseRequest(message)) {
    const reply = buildReturnToActiveCaseReply(activeLocalCaseBeforeDirectCaseSearch, activeCaseContext);
    const usedTools = ["localReturnToActiveCase"];
    const toolDebug = [
      {
        name: "localReturnToActiveCase",
        selected_case_id: activeLocalCaseBeforeDirectCaseSearch?.id || null,
        source: "active_local_case_before_case_search",
        token_policy: "0_tokens_local_response",
        routing: "returned_before_direct_case_search",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCaseBeforeDirectCaseSearch, pending_action),
    });
  }

  if (activeLocalCaseBeforeDirectCaseSearch && isLocalCaseNavigationRequest(message)) {
    const navResult = buildLocalCaseNavigationResult(pending_action, message);
    const usedTools = ["localActiveCaseNavigation"];
    const toolDebug = [
      {
        name: "localActiveCaseNavigation",
        selected_case_id: navResult.caseData?.id || null,
        navigation: normalizeDiagnosisPhrase(message),
        index: navResult.index,
        total: navResult.total,
        token_policy: "0_tokens_local_response",
        routing: "returned_before_direct_case_search",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply: navResult.reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: navResult.pendingAction,
    });
  }

  if (isDirectLocalCaseRequest(message)) {
    const directCaseResult = findBestDirectLocalCase(message);
    const selectedCase = directCaseResult.caseData;

    if (selectedCase) {
      const reply = buildDirectLocalCaseReply(
        selectedCase,
        directCaseResult.bestMatch,
        directCaseResult.searchText
      );

      const usedTools = ["localDirectCaseSearch"];
      const toolDebug = [
        {
          name: "localDirectCaseSearch",
          search_text: directCaseResult.searchText,
          selected_case_id: selectedCase.id || null,
          selected_case_score: directCaseResult.bestMatch?.score || null,
          matched_terms: directCaseResult.bestMatch?.matched_terms || [],
          token_policy: "0_tokens_local_response",
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      console.log("CDA tokenmåling pr. OpenAI-kald:", {
        usage_by_call: [],
        totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      });

      return res.status(200).json({
        success: true,
        reply,
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: encodeLocalCaseNavState(
          buildLocalCaseNavState(
            selectedCase,
            directCaseResult.searchText,
            directCaseResult.searchResult,
            0
          )
        ),
      });
    }

    return res.status(200).json({
      success: true,
      reply: `Jeg fandt ikke en præcis lokal case på “${directCaseResult.searchText}”. Prøv med diagnose, alder eller tema, fx: case ADHD uro i klassen, case angst pige eller case autisme overgang.`,
      model: "local",
      tools_used: ["localDirectCaseSearch"],
      tool_debug: [
        {
          name: "localDirectCaseSearch",
          search_text: directCaseResult.searchText,
          returned_matches: directCaseResult.searchResult?.total_returned || 0,
          token_policy: "0_tokens_local_response",
        },
      ],
      pending_action: null,
    });
  }

  const activeLocalCase = resolveActiveLocalCase(pending_action, activeCaseContext);

  if ((activeLocalCase || hasActiveCaseContext(activeCaseContext)) && isReturnToActiveCaseRequest(message)) {
    const reply = buildReturnToActiveCaseReply(activeLocalCase, activeCaseContext);
    const usedTools = ["localReturnToActiveCase"];
    const toolDebug = [
      {
        name: "localReturnToActiveCase",
        selected_case_id: activeLocalCase?.id || null,
        source: activeLocalCase ? "active_local_case" : "active_case_context",
        token_policy: "0_tokens_local_response",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
    });
  }

  if (activeLocalCase && isLocalCaseNavigationRequest(message)) {
    const navResult = buildLocalCaseNavigationResult(pending_action, message);
    const usedTools = ["localActiveCaseNavigation"];
    const toolDebug = [
      {
        name: "localActiveCaseNavigation",
        selected_case_id: navResult.caseData?.id || null,
        navigation: normalizeDiagnosisPhrase(message),
        index: navResult.index,
        total: navResult.total,
        token_policy: "0_tokens_local_response",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply: navResult.reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: navResult.pendingAction,
    });
  }

  if (activeLocalCase && isLocalPprCaseAngleRequest(message)) {
    const reply = buildLocalPprAngleReply(activeLocalCase, active_case_context);
    const usedTools = ["localActiveCasePprAngle"];
    const toolDebug = [
      {
        name: "localActiveCasePprAngle",
        selected_case_id: activeLocalCase.id || null,
        followup: message,
        token_policy: "0_tokens_local_response",
        routing: "returned_before_openai",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: pending_action,
    });
  }

  if (isParentDayPlanMessageRequest(message)) {
    const reply = buildParentDayPlanMessageReply(activeLocalCase, language);
    const usedTools = ["localParentDayPlanMessage"];
    const toolDebug = [
      {
        name: "localParentDayPlanMessage",
        action: "build_copy_ready_parent_message_with_home_day_plan",
        selected_case_id: activeLocalCase?.id || null,
        token_policy: "0_tokens_local_response",
        routing: "returned_before_local_case_followup",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
    });
  }

  if (activeLocalCase && isLocalCaseFollowupRequest(message)) {
    const reply = buildActiveLocalCaseFollowupReply(activeLocalCase, message);
    const usedTools = ["localActiveCaseSession"];
    const toolDebug = [
      {
        name: "localActiveCaseSession",
        selected_case_id: activeLocalCase.id || null,
        followup: message,
        token_policy: "0_tokens_local_response",
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: pending_action,
    });
  }

  if (pending_action === "pbl_profile") {
    if (isAffirmativeReply(message)) {
      const reply = getPblProfileTemplate();
      const usedTools = ["localPblProfileFlow"];
      const toolDebug = [
        {
          name: "localPblProfileFlow",
          action: "show_profile_template",
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      console.log("CDA tokenmåling pr. OpenAI-kald:", {
        usage_by_call: [],
        totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      });

      return res.status(200).json({
        success: true,
        reply,
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: "pbl_profile_input",
      });
    }

    if (isNegativeReply(message)) {
      const usedTools = ["localPblProfileFlow"];
      const toolDebug = [
        {
          name: "localPblProfileFlow",
          action: "decline_profile_template",
        },
      ];

      return res.status(200).json({
        success: true,
        reply: "Helt fint. Så går vi videre uden PBL-profilen.",
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: null,
      });
    }
  }

  if (pending_action === "pbl_profile_input") {
    const dynamicResult = await assessPblProfileDynamically(message);
    const { assessment, response, first, second } = dynamicResult;

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "dynamic_pbl_assessment",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

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

    if (assessment.status === "no_suitable_match") {
      const usedTools = ["dynamicPblAssessment"];
      const toolDebug = [
        {
          name: "dynamicPblAssessment",
          action: "no_suitable_existing_project",
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      console.log("CDA tokenmåling pr. OpenAI-kald:", {
        usage_by_call: usageByCall,
        totals: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      });

      return res.status(200).json({
        success: true,
        reply: assessment.no_match_reason
          ? `Ingen af de eksisterende projekter passer godt nok til elevprofilen. ${assessment.no_match_reason}`
          : "Ingen af de eksisterende projekter passer godt nok til elevprofilen. CDA vælger derfor ikke et tilfældigt projekt.",
        model: "gpt-5.4-mini",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: null,
      });
    }

    const state = encodePblChoiceState({
      firstId: first.id,
      secondId: second.id,
      firstReason: assessment.first_reason,
      secondReason: assessment.second_reason,
      profile: message,
      shown: 1,
    });

    const usedTools = ["dynamicPblAssessment"];
    const toolDebug = [
      {
        name: "dynamicPblAssessment",
        action: "whole_profile_assessment",
        first_choice: first.id,
        second_choice: second.id,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: usageByCall,
      totals: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    });

    return res.status(200).json({
      success: true,
      reply: formatPblChoice(
        first,
        1,
        message,
        assessment.first_reason
      ),
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: state,
    });
  }

  const pblChoiceState = decodePblChoiceState(pending_action);

  if (pblChoiceState) {
    const normalizedMessage = normalizeReplyIntent(message);
    const firstProject = getPblProjectById(pblChoiceState.firstId);
    const secondProject = getPblProjectById(pblChoiceState.secondId);

    const wantsFirst =
      normalizedMessage.includes("valg 1") ||
      normalizedMessage.includes("forslag 1") ||
      normalizedMessage.includes("forste") ||
      normalizedMessage.includes("første") ||
      normalizedMessage.includes("tilbage") ||
      (firstProject &&
        normalizeReplyIntent(message).includes(
          normalizeReplyIntent(firstProject.title)
        ));

    const wantsTailoredProject =
      pblChoiceState.shown === 2 &&
      (
        isNegativeReply(message) ||
        normalizedMessage.includes("nyt projekt") ||
        normalizedMessage.includes("skab et nyt") ||
        normalizedMessage.includes("tilpasset projekt")
      );

    const wantsSecond =
      normalizedMessage.includes("valg 2") ||
      normalizedMessage.includes("forslag 2") ||
      normalizedMessage.includes("nummer 2") ||
      normalizedMessage.includes("andet projekt") ||
      (
        pblChoiceState.shown !== 2 &&
        (normalizedMessage === "nej" || normalizedMessage === "nej tak")
      );

    if (wantsTailoredProject) {
      const tailoredResult = await createTailoredPblProject(
        pblChoiceState.profile,
        [firstProject, secondProject]
      );

      const { project, response } = tailoredResult;
      const inputTokens = Number(response?.usage?.input_tokens || 0);
      const outputTokens = Number(response?.usage?.output_tokens || 0);
      const totalTokens = Number(
        response?.usage?.total_tokens || inputTokens + outputTokens
      );

      const usageByCall = [
        {
          call: 1,
          phase: "dynamic_tailored_pbl_project",
          tools_returned_to_model: [],
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      ];

      const usedTools = ["dynamicTailoredPblProject"];
      const toolDebug = [
        {
          name: "dynamicTailoredPblProject",
          action: "create_after_two_rejections",
          rejected_project_ids: [
            firstProject?.id || null,
            secondProject?.id || null,
          ],
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

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
        reply: formatTailoredPblProject(project),
        model: "gpt-5.4-mini",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: null,
      });
    }

    if (wantsFirst && firstProject) {
      return res.status(200).json({
        success: true,
        reply: formatPblChoice(
          firstProject,
          1,
          pblChoiceState.profile,
          pblChoiceState.firstReason || ""
        ),
        model: "local",
        tools_used: ["localPblChoiceFlow"],
        tool_debug: [
          {
            name: "localPblChoiceFlow",
            action: "return_to_first_choice",
            project_id: firstProject.id,
          },
        ],
        pending_action: encodePblChoiceState({
          ...pblChoiceState,
          shown: 1,
        }),
      });
    }

    if (wantsSecond && secondProject) {
      return res.status(200).json({
        success: true,
        reply: formatPblChoice(
          secondProject,
          2,
          pblChoiceState.profile,
          pblChoiceState.secondReason || ""
        ),
        model: "local",
        tools_used: ["localPblChoiceFlow"],
        tool_debug: [
          {
            name: "localPblChoiceFlow",
            action: "show_second_choice",
            project_id: secondProject.id,
          },
        ],
        pending_action: encodePblChoiceState({
          ...pblChoiceState,
          shown: 2,
        }),
      });
    }

    if (isAffirmativeReply(message)) {
      const selectedProject =
        pblChoiceState.shown === 2 && secondProject
          ? secondProject
          : firstProject;

      return res.status(200).json({
        success: true,
        reply: selectedProject
          ? `Godt. I har valgt **${selectedProject.title}**. Næste skridt er, at læreren og eleven sammen aftaler første lille delmål og sikkerhedsrammen.`
          : "Godt. Projektet er valgt.",
        model: "local",
        tools_used: ["localPblChoiceFlow"],
        tool_debug: [
          {
            name: "localPblChoiceFlow",
            action: "confirm_choice",
            project_id: selectedProject?.id || null,
          },
        ],
        pending_action: null,
      });
    }
  }

  if (isConcreteStudentPblRequest(message)) {
    const usedTools = ["localPblProfileOffer"];
    const toolDebug = [
      {
        name: "localPblProfileOffer",
        action: "offer_profile_before_project_matching",
      },
    ];

    return res.status(200).json({
      success: true,
      reply: "PBL kunne være relevant her, men jeg vil ikke foreslå et konkret projekt uden en kort elevprofil. Profilen skal blandt andet afklare alder, interesser, styrker, koncentration, støttebehov, arbejdsform, sikkerhed og fagligt mål. Vil du have den korte elevprofilskabelon?",
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: "pbl_profile",
    });
  }

  if (isOtherExperienceCaseRequest(message)) {
    const selectedCase = findBestOtherExperienceCase(message);

    if (selectedCase) {
      const caseInstructions = [
        "Du er Heidi, CDA's faglige skolekonsulent.",
        audienceInstructions,
        "Brugeren spørger, hvad andre har gjort i en lignende situation.",
        "Svar kort og naturligt på det valgte sprog ud fra den ene vedlagte case.",
        "Fortæl kun: den lignende situation, hvad den voksne gjorde, hvad der virkede, og én enkel reference brugeren kan overveje.",
        "Lav ikke en fuld analyse. Brug ikke standardoverskrifter som 'Det peger mest på'.",
        "Tilføj ikke generelle råd, diagnoser eller oplysninger, som ikke står i casen.",
        "Skriv højst 120 ord."
      ].join("\n");

      const caseInput = [
        `BRUGERENS SPØRGSMÅL:\n${message}`,
        "",
        "VALGT LIGNENDE CASE:",
        JSON.stringify(selectedCase, null, 2),
      ].join("\n");

      const response = await openai.responses.create({
        model: "gpt-5.4-mini",
        reasoning: {
          effort: "low",
        },
        instructions: caseInstructions,
        input: caseInput,
        max_output_tokens: 300,
      });

      const inputTokens = Number(response?.usage?.input_tokens || 0);
      const outputTokens = Number(response?.usage?.output_tokens || 0);
      const totalTokens = Number(
        response?.usage?.total_tokens || inputTokens + outputTokens
      );

      const usageByCall = [
        {
          call: 1,
          phase: "local_case_reference",
          tools_returned_to_model: [],
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      ];

      const usedTools = ["localOtherExperienceCaseSearch"];
      const toolDebug = [
        {
          name: "localOtherExperienceCaseSearch",
          arguments: { search: message },
          selected_case_id: selectedCase.id,
          selected_case_score: selectedCase.score,
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

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
        pending_action: null,
      });
    }
  }

  const roleplayContextActive = isRoleplayContextActive(message, pending_action);

  const heidiPrompt = roleplayContextActive
    ? readHeidiPrompt() + buildRoleplayRuleInjection()
    : readHeidiPrompt();

  if (isDirectSpecialistPanelRequest(message)) {
    const requestedAngle = getRequestedSpecialistAngle(message);

    if (requestedAngle === "ppr" && (activeLocalCase || hasActiveCaseContext(activeCaseContext))) {
      const reply = buildLocalPprAngleReply(activeLocalCase, activeCaseContext);
      const usedTools = ["localPprAngleOnActiveCase"];
      const toolDebug = [
        {
          name: "localPprAngleOnActiveCase",
          active_local_case_id: activeLocalCase?.id || null,
          source: activeLocalCase ? "active_local_case" : "active_case_context",
          role,
          response_style,
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      return res.status(200).json({
        success: true,
        reply,
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: activeLocalCase?.id ? `local_case:${activeLocalCase.id}` : pending_action || null,
      });
    }

    const specialistPanel =
      requestedAngle === "named"
        ? buildSingleSpecialistPanel(findNamedSpecialistInMessage(message))
        : getTargetedSpecialistPanel(requestedAngle, message);
    const specialistCaseContextBlock = buildCompactSpecialistCaseContext(activeLocalCase, activeCaseContext);

    if (specialistPanel.specialistIds.length === 0) {
      throw new Error("Specialistpanelet indeholder ingen specialister");
    }

    const headingInstruction =
      requestedAngle === "named" || requestedAngle === "psychologist"
        ? "Brug specialistens fulde navn fra RELEVANT LOKAL SPECIALISTDATA i overskrifterne, fx '**[navn]s vurdering**' og '**[navn]s startforslag**'. Brug kun en generisk rolle-overskrift, hvis intet navn findes i data."
        : requestedAngle === "ppr"
          ? "Brug præcis disse markdown-overskrifter: **PPR-vinkel** og **Næste observationer**."
          : "Brug korte markdown-overskrifter med fed skrift, fx **Specialistvinkel** og **Næste skridt**.";

    const specialistInstructions = [
      "Du er Heidi i CDA Engine.",
      "Svar kun, fordi brugeren selv har bedt om specialistvinkel på den aktive case/sag.",
      "Brug den aktive case/sag som konkret grundlag. Opfind ikke manglende casefelter.",
      "Stil ikke diagnose. Giv ikke medicinråd. Beskriv kun støttebehov, mønstre og næste faglige skridt.",
      "Svar lærer-nært, praktisk og kort. Højst 3 konkrete handlinger.",
      headingInstruction,
      response_style === "Dyb"
        ? "Svar lidt mere udførligt, men uden lange forklaringer."
        : "Svar kort og direkte.",
    ].join("\n");

    const specialistInput = [
      specialistCaseContextBlock,
      "",
      "BRUGERENS BESKED:",
      message,
      "",
      "RELEVANT LOKAL SPECIALISTDATA:",
      specialistPanel.indexText,
    ].filter((part) => String(part || "").trim()).join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: specialistInstructions,
      input: specialistInput,
      max_output_tokens:
        response_style === "Dyb"
          ? 650
          : response_style === "Kort"
            ? 320
            : 450,
      text: {
        format: {
          type: "json_schema",
          name: "cda_targeted_specialist_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              selected_specialist_ids: {
                type: "array",
                items: {
                  type: "string",
                  enum: specialistPanel.specialistIds,
                },
              },
              reply: {
                type: "string",
              },
            },
            required: ["selected_specialist_ids", "reply"],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.status === "incomplete") {
      throw new Error("Ufuldstændigt svar fra specialistpanelet");
    }

    const panelResponse = JSON.parse(response.output_text || "{}");
    const validSpecialistIds = new Set(
      specialistPanel.specialistIds
    );
    const selectedSpecialistIds = Array.from(
      new Set(
        (Array.isArray(panelResponse.selected_specialist_ids)
          ? panelResponse.selected_specialist_ids
          : []
        ).filter((id) => validSpecialistIds.has(String(id)))
      )
    ).slice(0, requestedAngle === "specialists" ? 3 : 1);

    const reply = String(panelResponse.reply || "").trim();

    if (!reply) {
      throw new Error("Specialistpanelet returnerede intet svar");
    }

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "targeted_specialist_on_active_case",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["targetedLocalSpecialistRouting"];
    const toolDebug = [
      {
        name: "targetedLocalSpecialistRouting",
        requested_angle: requestedAngle,
        selected_specialists: selectedSpecialistIds.map((id) =>
          specialistPanel.specialistSummaries.find(
            (specialist) => specialist.id === id
          )
        ).filter(Boolean),
        active_local_case_id: activeLocalCase?.id || null,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: activeLocalCase?.id ? `local_case:${activeLocalCase.id}` : null,
    });
  }

  if (isCaseSpecialistsInvolvedRequest(message)) {
    if (!activeLocalCase && !hasActiveCaseContext(activeCaseContext)) {
      const reply =
        "Jeg har ikke en aktiv case at knytte specialister til lige nu. Beskriv situationen, eller gå tilbage til en tidligere case, så kan jeg pege på hvilke CDA-specialister der er relevante.";
      const usedTools = ["caseSpecialistsInvolvedNoActiveCase"];
      const toolDebug = [
        {
          name: "caseSpecialistsInvolvedNoActiveCase",
          role,
          response_style,
        },
      ];

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      return res.status(200).json({
        success: true,
        reply,
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: null,
      });
    }

    const caseText = [
      activeLocalCase?.titel,
      activeLocalCase?.title,
      activeLocalCase?.problem,
      activeLocalCase?.kort_beskrivelse,
      activeLocalCase?.description,
      activeLocalCase?.beskrivelse,
      activeCaseContext?.summary,
      activeCaseContext?.known_context,
      activeCaseContext?.last_user_message,
    ].filter(Boolean).join(" ");

    const specialistPanel = getTargetedSpecialistPanel("case_team", message, caseText);
    const specialistCaseContextBlock = buildCompactSpecialistCaseContext(activeLocalCase, activeCaseContext);

    if (specialistPanel.specialistIds.length === 0) {
      throw new Error("Specialistpanelet indeholder ingen specialister");
    }

    const caseTeamInstructions = [
      "Du er Heidi i CDA Engine.",
      "Brugeren spørger, hvilke CDA-specialister der har været relevante for den aktive case/sag.",
      "Brug kun den aktive case/sag og RELEVANT LOKAL SPECIALISTDATA som grundlag. Opfind ikke manglende casefelter, specialister eller citater.",
      "Stil ikke diagnose. Giv ikke medicinråd.",
      "Vis hver relevant specialist på egen linje: **[specialistens fulde navn fra data]** efterfulgt af ét kort, case-specifikt fokuspunkt (1 linje).",
      "Nævn kun specialister som RELEVANT LOKAL SPECIALISTDATA faktisk indeholder. Hvis en specialist kun er indirekte relevant (fx kun ved mistanke om komorbiditet), skriv det kort.",
      "Afslut altid med én linje: 'Start her: [navn] + [navn]' med de 1-2 mest presserende specialister for netop denne case.",
      "Svar kort og konkret, uden lange forklaringer mellem punkterne.",
    ].join("\n");

    const caseTeamInput = [
      specialistCaseContextBlock,
      "",
      "BRUGERENS BESKED:",
      message,
      "",
      "RELEVANT LOKAL SPECIALISTDATA:",
      specialistPanel.indexText,
    ].filter((part) => String(part || "").trim()).join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: caseTeamInstructions,
      input: caseTeamInput,
      max_output_tokens:
        response_style === "Dyb" ? 750 : response_style === "Kort" ? 400 : 550,
      text: {
        format: {
          type: "json_schema",
          name: "cda_case_team_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              selected_specialist_ids: {
                type: "array",
                items: {
                  type: "string",
                  enum: specialistPanel.specialistIds,
                },
              },
              reply: {
                type: "string",
              },
            },
            required: ["selected_specialist_ids", "reply"],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.status === "incomplete") {
      throw new Error("Ufuldstændigt svar fra specialistpanelet");
    }

    const panelResponse = JSON.parse(response.output_text || "{}");
    const validSpecialistIds = new Set(specialistPanel.specialistIds);
    const selectedSpecialistIds = Array.from(
      new Set(
        (Array.isArray(panelResponse.selected_specialist_ids)
          ? panelResponse.selected_specialist_ids
          : []
        ).filter((id) => validSpecialistIds.has(String(id)))
      )
    ).slice(0, 5);

    const reply = String(panelResponse.reply || "").trim();

    if (!reply) {
      throw new Error("Specialistpanelet returnerede intet svar");
    }

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "case_specialists_involved",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["caseSpecialistsInvolvedRouting"];
    const toolDebug = [
      {
        name: "caseSpecialistsInvolvedRouting",
        selected_specialists: selectedSpecialistIds.map((id) =>
          specialistPanel.specialistSummaries.find(
            (specialist) => specialist.id === id
          )
        ).filter(Boolean),
        active_local_case_id: activeLocalCase?.id || null,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: activeLocalCase?.id ? `local_case:${activeLocalCase.id}` : null,
    });
  }

  if (isReadableStudentProfileRequest(message)) {
    const profileTextResult = await createReadableStudentProfileText(message, language);
    const response = profileTextResult.response;

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usedTools = ["studentProfileTextV1"];
    const toolDebug = [
      {
        name: "studentProfileTextV1",
        action: "create_readable_profile_text",
        intent: profileTextResult.intent,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [
        {
          call: 1,
          phase: "student_profile_text_v1",
          intent: profileTextResult.intent,
          tools_returned_to_model: [],
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
        },
      ],
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
      reply: profileTextResult.reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }

  if (isStudentProfileRequest(message)) {
    const profileResult = await createStudentProfileFromText(message, language);
    const response = profileResult.response;

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "student_profile_v1",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["studentProfileV1"];
    const toolDebug = [
      {
        name: "studentProfileV1",
        action: "create_profile_from_free_text",
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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
      reply: profileResult.reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }


  if (isPracticalDayPlanRequest(message)) {
    const reply = buildPracticalDayPlanReply(message, language);
    const usedTools = ["localPracticalDayPlan"];
    const toolDebug = [
      {
        name: "localPracticalDayPlan",
        action: "build_copy_ready_visual_day_plan",
        mode: getPracticalDayPlanMode(message),
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
    });
  }

  const localTemplateRequest = getLocalTemplateRequest(message);

  if (localTemplateRequest?.type === "list") {
    const titles = Array.from(
      new Set(
        localTemplateRequest.templates
          .map((template) => String(template?.title || "").trim())
          .filter(Boolean)
      )
    );

    const reply = [
      language === "English"
        ? `CDA's template bank contains ${titles.length} existing templates:`
        : `CDA's templatebank indeholder ${titles.length} eksisterende skabeloner:`,
      "",
      ...titles.map((title) => `- ${title}`),
    ].join("\n");

    const usedTools = ["localTemplateRouting"];
    const toolDebug = [
      {
        name: "localTemplateRouting",
        action: "list_templates",
        total_templates: titles.length,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
    });
  }

  if (localTemplateRequest?.type === "not_found") {
    const titles = Array.from(
      new Set(
        localTemplateRequest.templates
          .map((template) => String(template?.title || "").trim())
          .filter(Boolean)
      )
    );

    const reply = language === "English"
      ? [
          "I found no existing template in CDA's template bank that matches your request.",
          titles.length > 0
            ? `The template bank includes: ${titles.slice(0, 6).join(", ")}.`
            : "The template bank contains no templates.",
        ].join("\n\n")
      : [
          "Jeg fandt ingen eksisterende skabelon i CDA's templatebank, der matcher din forespørgsel.",
          titles.length > 0
            ? `Templatebanken indeholder blandt andet: ${titles.slice(0, 6).join(", ")}.`
            : "Templatebanken indeholder ingen skabeloner.",
        ].join("\n\n");

    const usedTools = ["localTemplateRouting"];
    const toolDebug = [
      {
        name: "localTemplateRouting",
        action: "no_matching_template",
        total_templates: localTemplateRequest.total,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: [],
      totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    });

    return res.status(200).json({
      success: true,
      reply,
      model: "local",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
    });
  }

  if (localTemplateRequest?.type === "match") {
    const directTemplateFile = getDirectTemplateFileRequest(
      message,
      localTemplateRequest.template,
      {
        allowIndirectResourceDisplay:
          localTemplateRequest.indirectResourceRequest === true,
      }
    );

    if (directTemplateFile) {
      const usedTools = ["localTemplateRouting"];
      const toolDebug = [
        {
          name: "localTemplateRouting",
          action: "show_existing_template_direct_file",
          template_id: localTemplateRequest.template?.id || null,
          template_title: localTemplateRequest.template?.title || null,
          content_file: directTemplateFile.contentFile,
          match_score: localTemplateRequest.score,
          matched_fields: localTemplateRequest.matchedFields,
          matched_words: localTemplateRequest.matchedWords,
          role,
          response_style,
        },
      ];

      const reply = directTemplateFile.content;

      console.log("CDA værktøjskald:", {
        tools_used: usedTools,
        tool_debug: toolDebug,
      });

      console.log("CDA tokenmåling pr. OpenAI-kald:", {
        usage_by_call: [],
        totals: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      });

      return res.status(200).json({
        success: true,
        reply,
        model: "local",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: preserveActiveLocalCasePendingAction(activeLocalCase, pending_action),
      });
    }

    const templateInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      "LOKAL CDA-TEMPLATEROUTING",
      "Brug kun den ene vedlagte eksisterende CDA-skabelon som grundlag for svaret.",
      "Brugeren har udtrykkeligt bedt om en eksisterende skabelon fra CDA's templatebank. Sig derfor ikke, at templatebanken er utilgængelig.",
      "Opfind ikke en ny skabelon, nye afsnit, nye faglige påstande eller manglende personoplysninger.",
      "Når brugeren beder om at få skabelonen vist, skal du gengive dens praktiske indhold troværdigt og komplet.",
      "Bevar tomme felter og pladsholdere, når brugeren ikke har givet værdier. Teknisk betingelsessyntaks må omskrives til tydelige valgfrie felter uden at ændre indholdet.",
      "Vis ikke interne ids, matchscore, søgeord eller datastruktur.",
      "Svar kort før selve skabelonen. Afslut uden et generisk tilbud om mere hjælp.",
      "Svarstilen må ikke få dig til at udelade centrale dele af den eksisterende skabelon.",
      `AKTUEL SVARSTIL: ${response_style}`,
    ].join("\n");

    const templateInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "DEN ENE MATCHENDE EKSISTERENDE CDA-SKABELON:",
      JSON.stringify(localTemplateRequest.context, null, 2),
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: templateInstructions,
      input: templateInput,
      max_output_tokens: 1600,
    });

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "template_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localTemplateRouting"];
    const toolDebug = [
      {
        name: "localTemplateRouting",
        action: "show_existing_template",
        template_id: localTemplateRequest.template?.id || null,
        template_title: localTemplateRequest.template?.title || null,
        match_score: localTemplateRequest.score,
        matched_fields: localTemplateRequest.matchedFields,
        matched_words: localTemplateRequest.matchedWords,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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

    const reply = String(response.output_text || "")
      .replace(/\s*(?:(?:Hvis du vil,\s*kan jeg(?: også)?)|(?:Vil du have)|(?:If you want,\s*I can(?: also)?))[^.!?]*(?:[.!?]|$)\s*$/i, "")
      .trim();

    return res.status(200).json({
      success: true,
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }

  const structuredDiagnosisMeta = getSingleStructuredDiagnosisMatch(message);

  const automaticComorbidityContext =
    structuredDiagnosisMeta &&
    isConcreteKnownDiagnosisCase(message)
      ? buildAutomaticComorbidityContext(structuredDiagnosisMeta)
      : null;

  if (structuredDiagnosisMeta && automaticComorbidityContext) {
    const structuredDiagnosis = loadStructuredDiagnosis(
      structuredDiagnosisMeta
    );

    const {
      context: diagnosisContext,
      selectedSections,
    } = buildStructuredDiagnosisContext(
      structuredDiagnosis,
      message,
      role
    );

    const automaticComorbidityInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      "AUTOMATISK CDA-SAMMENLIGNING VED KENDT DIAGNOSE",
      "Dette flow bruges kun, fordi brugeren beskriver en konkret elev eller et konkret barn med en kendt diagnose.",
      "Sammenhold observationerne med den kendte diagnose og de vedlagte komorbiditetsdata i ét samlet fagligt svar.",
      "Vurder først, om observationerne kan forklares rimeligt inden for den kendte diagnose. Hvis de kan, skal du ikke gøre komorbiditet til et tema.",
      "Brug kun komorbiditetsdata, når observationerne tydeligt ligger ud over eller afviger fra det forventede billede ved den kendte diagnose.",
      "Sig aldrig, at CDA eller brugeren har fundet eller påvist en komorbiditet. Stil aldrig en ny diagnose, og skriv ikke 'måske autisme', 'måske depression' eller tilsvarende på baggrund af en kort beskrivelse.",
      "Omsæt de interne spor til neutrale observationsområder som fx bekymring og undgåelse, social belastning, energifald og funktionsændring, rigiditet, sansning eller vedvarende konfliktmønstre.",
      "Når noget ligger tydeligt uden for den kendte diagnose, beskriv afvigelsen forsigtigt og anbefal konkrete observationer samt drøftelse med relevante lærere/team, PPR eller en relevant specialist. Pres ikke på for udredning; formålet er bedre forståelse og støtte.",
      "Brug ikke specialistpanelet i dette flow. Udfør ikke Analyse-systemets fulde analyse.",
      role === "Specialist"
        ? "Svar fagperson til fagperson. Skeln tydeligt mellem observation, hypotese og konklusion, og henvis ikke automatisk brugeren til PPR."
        : role === "Forælder"
          ? "Svar i forældrevenligt sprog. Antag ikke, at barnet viser det samme hjemme og i skole, og respekter bekymring for stempling eller udredning."
          : "Svar praksisnært til læreren og gør næste observation eller handling tydelig.",
      "I kort normal drift: giv højst 3 konkrete handlinger. Undgå generiske tilbud om mere hjælp. Ét konkret opklarende spørgsmål er tilladt, hvis svaret er nødvendigt for at bringe sagen fagligt videre.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Uddyb de relevante forskelle mellem kendt diagnose, afvigende observationer og nødvendige næste skridt uden at diagnosticere."
          : "Giv en kort faglig forklaring og konkrete næste skridt.",
    ].join("\n");

    const automaticComorbidityInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "RELEVANTE STRUKTUREREDE DATA OM DEN KENDTE DIAGNOSE:",
      JSON.stringify(diagnosisContext, null, 2),
      "",
      "RELEVANTE CDA-DATA TIL AUTOMATISK OBSERVATIONSSAMMENLIGNING:",
      JSON.stringify(automaticComorbidityContext, null, 2),
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: automaticComorbidityInstructions,
      input: automaticComorbidityInput,
      max_output_tokens:
        response_style === "Dyb"
          ? 1000
          : response_style === "Kort"
            ? 600
            : 800,
    });

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "automatic_comorbidity_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localAutomaticComorbidityRouting"];
    const toolDebug = [
      {
        name: "localAutomaticComorbidityRouting",
        diagnosis_id: structuredDiagnosisMeta.id,
        diagnosis_file: structuredDiagnosisMeta.fil,
        diagnosis_sections: selectedSections,
        comorbidity_source: automaticComorbidityContext.source,
        observation_pattern_count:
          automaticComorbidityContext.observation_patterns.length,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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
      reply: String(response.output_text || "").trim(),
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }

  if (isBornehavePracticeRequest(message)) {
    const age = extractBornehaveAge(message);
    const routing = getBornehaveRouting({
      text: message,
      age,
      tags: [],
    });
    const bornehaveContext = buildBornehavePracticeContext(routing);

    const bornehaveInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      "LOKALT CDA-BØRNEHAVESPOR",
      "Disse regler har forrang, når de kolliderer med almindelige lærer- eller forældreregler.",
      "Brug den vedlagte børnehaveskabelon og de udvalgte praksisafsnit som fagligt grundlag. Brug kun de dele, der er relevante for spørgsmålet.",
      "Svar naturligt og praksisnært. Vis ikke filnavne, interne ids, tags, scores eller datastruktur.",
      "Børnehavesporet observerer og støtter; det diagnosticerer ikke. Beskriv konkrete mønstre, barnets mulige oplevelse, hvad der kan afprøves, og hvornår observationerne bør løftes videre.",
      "Skeln mellem almindelig udviklingsvariation og vedvarende mønstre, der påvirker trivsel, deltagelse, relationer eller sikkerhed. Konkludér aldrig diagnose ud fra en kort beskrivelse.",
      "Når brugeren arbejder i børnehaven, skal svaret rettes til pædagogen eller børnehavepersonalet — ikke til en klasselærer.",
      "Ved spørgsmål om skolestart eller overlevering skal styrker, triggere, det der virker, det der ikke virker, relationer, kommunikation og støttebehov fremgå tydeligt, så skolen kan starte rigtigt fra første dag.",
      "Ved spørgsmål om forældresamtaler skal observationer deles neutralt og samarbejdende uden etiketter eller skjulte diagnoselignende konklusioner.",
      "Giv højst 3 konkrete handlinger i normal kort drift. Ét målrettet fagligt opfølgende spørgsmål er tilladt, når det er nødvendigt; afslut ikke med et generisk tilbud om mere hjælp.",
      "Brug ikke cases, PBL, specialistpanel, rollespil eller komorbiditet i dette flow, medmindre brugeren udtrykkeligt har bedt om det — sådanne forespørgsler håndteres i andre flows.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Uddyb de relevante pædagogiske sammenhænge uden unødvendig teori eller gentagelser."
          : "Giv en kort faglig forklaring og konkrete næste skridt.",
    ].join("\n");

    const bornehaveInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "RELEVANTE CDA-DATA FRA BØRNEHAVESPOR:",
      JSON.stringify(bornehaveContext, null, 2),
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: bornehaveInstructions,
      input: bornehaveInput,
      max_output_tokens:
        response_style === "Dyb"
          ? 900
          : response_style === "Kort"
            ? 500
            : 700,
    });

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "bornehave_practice_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localBornehavePracticeRouting"];
    const toolDebug = [
      {
        name: "localBornehavePracticeRouting",
        primary_template: routing?.primary_template || null,
        included_templates: bornehaveContext.templates.map(
          (template) => template.id
        ),
        selected_knowledge_entries:
          routing?.practice_knowledge?.selected_entry_ids || [],
        matched_behavior_tags:
          routing?.matched_behavior_tags || [],
        handover_ready: Boolean(routing?.handover_ready),
        age,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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

    const reply = String(response.output_text || "")
      .replace(/\s*(?:(?:Hvis du vil,\s*kan jeg(?: også)?)|(?:Vil du have)|(?:If you want,\s*I can(?: also)?))[^.!?]*(?:[.!?]|$)\s*$/i, "")
      .trim();

    return res.status(200).json({
      success: true,
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }

  if (structuredDiagnosisMeta) {
    const structuredDiagnosis = loadStructuredDiagnosis(
      structuredDiagnosisMeta
    );

    const {
      context: diagnosisContext,
      selectedSections,
    } = buildStructuredDiagnosisContext(
      structuredDiagnosis,
      message,
      role
    );

    const diagnosisInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      "STRUKTURERET CDA-DIAGNOSEFLOW",
      "Brug de vedlagte strukturerede CDA-diagnosedata som det faglige grundlag for svaret.",
      "Besvar brugerens konkrete spørgsmål dynamisk. Gengiv ikke data mekanisk, og vis ikke interne feltnavne eller datastruktur.",
      "Brug kun de dele af datagrundlaget, der er relevante for spørgsmålet og rollen.",
      "Kobl ikke en konkret elev til en diagnose uden formel udredning. Ved en kendt diagnose må du forklare relevante mønstre og hensyn uden at genvurdere diagnosen.",
      "Udfør ikke Analyse-systemets fulde caseanalyse og foretag ikke komorbiditetstest i dette flow.",
      role === "Specialist"
        ? "Svar fagperson til fagperson med præcist specialistsprog, men hold dig til det konkrete spørgsmål og lav ikke en fuld Analyse-vurdering."
        : role === "Forælder"
          ? "Forældresvaret skal tage udgangspunkt i hjemmet og familiens hverdag. Antag aldrig, at barnet viser samme adfærd hjemme og i skolen. Skolen må kun nævnes kort som en mulig sammenligning, fx at spørge læreren, hvad læreren ser. Forskelle mellem hjem og skole kan have mange forklaringer og må ikke tolkes sikkert. Giv højst 3 konkrete råd og afslut uden et generisk tilbud eller et automatisk spørgsmål."
          : "Hold svaret praksisnært og direkte anvendeligt for den valgte rolle.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Uddyb relevante faglige sammenhænge, men undgå unødvendig teori og gentagelser."
          : "Giv en kort forklaring og konkrete relevante hensyn.",
    ].join("\n");

    const diagnosisInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "RELEVANTE STRUKTUREREDE CDA-DIAGNOSEDATA:",
      JSON.stringify(diagnosisContext, null, 2),
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: diagnosisInstructions,
      input: diagnosisInput,
      max_output_tokens:
        response_style === "Dyb"
          ? 900
          : response_style === "Kort"
            ? 500
            : 700,
    });

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "structured_diagnosis_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localStructuredDiagnosisRouting"];
    const toolDebug = [
      {
        name: "localStructuredDiagnosisRouting",
        diagnosis_id: structuredDiagnosisMeta.id,
        diagnosis_file: structuredDiagnosisMeta.fil,
        selected_sections: selectedSections,
        role,
        response_style,
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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

    const diagnosisReply = String(response.output_text || "")
      .replace(/\s*(?:(?:Hvis du vil,\s*kan jeg(?: også)?)|(?:Vil du have)|(?:If you want,\s*I can(?: also)?))[^.!?]*(?:[.!?]|$)\s*$/i, "")
      .trim();

    return res.status(200).json({
      success: true,
      reply: diagnosisReply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: null,
    });
  }

  if (!shouldUseSpecializedToolFlow(message)) {
    const normalModeInstructions =
      role === "Specialist"
        ? [
            "CDA-SPECIALISTSPOR UDEN ANALYSEMODUL",
            "Disse specialistregler har forrang over HeidiPromptens normale lærer- og forældreformat.",
            "Svar fagperson til fagperson. Brug ikke overskriften 'Det kan du gøre nu' og tal ikke til brugeren som klasselærer eller forælder.",
            "Brug denne kompakte disposition: Foreløbig faglig forståelse; Datamangler; Mulige alternative forklaringer; Bør afdækkes; Fagligt næste skridt.",
            "Skeln tydeligt mellem observation, hypotese og konklusion. Peg ikke sikkert på diagnose ud fra en kort case.",
            "Formulér eventuelle skoleindsatser som anbefalinger, specialisten kan give videre til skolen — ikke som direkte instruktioner til specialisten.",
            "Under 'Fagligt næste skridt' skal handlingerne være specialistens egne faglige handlinger, fx at indhente oplysninger, afklare mønstre, aftale en afprøvning med skolen eller evaluere effekten — ikke lærerens direkte klassehandlinger.",
            "Henvis ikke brugeren til PPR, da brugeren selv kan være PPR, psykolog eller skolekonsulent.",
            "Afslut ikke med generiske tilbud som 'Hvis du vil, kan jeg hjælpe'. Stil højst ét konkret fagligt opfølgende spørgsmål, hvis casen kræver det.",
            "Udfør ikke en fuld Analyse-vurdering og opfind ikke oplysninger, der mangler.",
          ]
        : [
            "NORMAL RÅDGIVNING UDEN EKSTRA MODULER",
            "Giv en direkte faglig vurdering, en kort forklaring og højst 3 konkrete handlinger.",
          ];

    const normalInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      activeCaseInstructions,
      "",
      ...normalModeInstructions,
      "Svar ud fra CDA's interne faglige prompt og regler.",
      "Brug ikke cases, PBL, specialistpanel, rollespil, skabeloner eller komorbiditet, medmindre brugeren udtrykkeligt beder om det.",
      "Foretag ingen internetsøgning og påstå ikke, at oplysninger er hentet på nettet.",
      "PBL må ikke præsenteres som et elevprojekt uden en udfyldt elevprofil.",
      "Hvis PBL efter din faglige vurdering kan være en relevant senere mulighed, må du højst nævne det kort og spørge præcist: 'PBL kunne være relevant her. Vil du have en kort elevprofilskabelon?'",
      "Når du stiller netop dette spørgsmål, skal du til sidst tilføje maskinmarkøren [[PENDING_ACTION:PBL_PROFILE]]. Markøren vises ikke til brugeren.",
      "Hvis PBL ikke er relevant, må du ikke nævne det eller tilføje markøren.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Forklar relevante faglige sammenhænge, men hold fokus på brugerens konkrete problem."
          : "Giv en kort forklaring og konkrete næste skridt.",
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: normalInstructions,
      input: contextualInput,
      max_output_tokens: response_style === "Dyb" ? 900 : 700,
    });

    const normalReplyData = extractPendingAction(response.output_text);
    const normalReply = normalReplyData.pendingAction
      ? normalReplyData.reply
      : normalReplyData.reply
          .replace(/\s*(?:(?:Hvis du vil,\s*kan jeg(?: også)?)|(?:Vil du have)|(?:If you want,\s*I can(?: also)?))[^.!?]*(?:[.!?]|$)\s*$/i, "")
          .trim();

    const inputTokens = Number(response?.usage?.input_tokens || 0);
    const outputTokens = Number(response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "normal_advice_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localNormalAdviceRouting"];
    const toolDebug = [
      {
        name: "localNormalAdviceRouting",
        arguments: {
          language,
          role,
          response_style,
        },
      },
    ];

    console.log("CDA værktøjskald:", {
      tools_used: usedTools,
      tool_debug: toolDebug,
    });

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
      reply: normalReply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: normalReplyData.pendingAction,
    });
  }

  const runtimeInstructions = [
    heidiPrompt,
    "",
    audienceInstructions,
    "",
    activeCaseInstructions,
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
    input: contextualInput,
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

  console.log("CDA værktøjskald:", {
    tools_used: usedTools,
    tool_debug: toolDebug,
  });

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

  const runtimeReplyData = extractPendingAction(response.output_text);

  return res.status(200).json({
  success: true,
  reply: runtimeReplyData.reply,
  model: "gpt-5.4-mini",
  tools_used: usedTools,
  tool_debug: toolDebug,
  pending_action: runtimeReplyData.pendingAction,
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
