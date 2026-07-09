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

function isDirectSpecialistPanelRequest(message) {
  const text = normalizeDiagnosisPhrase(message);
  const directPatterns = [
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "specialistperspektiv",
    "tværfaglig vurdering",
    "tvaerfaglig vurdering",
  ];

  return directPatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
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

function getTemplateFiles() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_TemplateFiles.json"
  );

  const registry = readJsonFile(
    filePath,
    "data/CDA_TemplateFiles.json blev ikke fundet"
  );

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

  const templates = [...categoryTemplates, ...standaloneTemplates]
    .filter((template) => template.id && template.title && template.content_file);

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

  const directBankRequest = bankPatterns.some((pattern) =>
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

  const indirectResourceRequest = indirectResourcePatterns.some((pattern) =>
    text.includes(normalizeTemplateSearch(pattern))
  );

  const knownTemplateMention = templates.some((template) => {
    const candidates = [
      template?.id,
      template?.title,
      ...(Array.isArray(template?.command_triggers)
        ? template.command_triggers
        : []),
    ];

    return candidates.some((candidate) =>
      templatePhraseIsPresent(text, candidate)
    );
  });

  const listRequest =
    directBankRequest &&
    listPatterns.some((pattern) =>
      text.includes(normalizeTemplateSearch(pattern))
    );

  return {
    text,
    directBankRequest,
    indirectResourceRequest,
    knownTemplateMention,
    listRequest,
    isDirectRequest: directBankRequest || knownTemplateMention,
    isTemplateRequest:
      directBankRequest ||
      knownTemplateMention ||
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
      oprettet_af_signatur: { type: "string" },
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
      "oprettet_af_signatur",
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
      `**Created by / signature:** ${cleanField(profile?.oprettet_af_signatur)}`,
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
    `**Oprettet af / signatur:** ${cleanField(profile?.oprettet_af_signatur)}`,
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
    "Brug registreringsfelterne præcist som metadata. Ændr ikke navn, klasse/gruppe eller signatur.",
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
      `oprettet_af_signatur: ${registration.oprettet_af_signatur || missing}`,
      "",
      "ELEVCASE:",
      studentCaseText || message,
      "",
      "Udtræk profilen i de faste felter. Registreringsfelterne skal gengives præcist i de tilsvarende schemafelter.",
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
  profile.oprettet_af_signatur = registration.oprettet_af_signatur || profile.oprettet_af_signatur || missing;

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
  const marker = "[[PENDING_ACTION:PBL_PROFILE]]";
  const text = String(replyText || "");

  if (!text.includes(marker)) {
    return {
      reply: text.trim(),
      pendingAction: null,
    };
  }

  return {
    reply: text.replace(marker, "").trim(),
    pendingAction: "pbl_profile",
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

try {
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

  const heidiPrompt = readHeidiPrompt();

  if (isDirectSpecialistPanelRequest(message)) {
    const specialistPanel = getCompactSpecialistPanelIndex();

    if (specialistPanel.specialistIds.length === 0) {
      throw new Error("Specialistpanelet indeholder ingen specialister");
    }

    const specialistInstructions = [
      heidiPrompt,
      "",
      audienceInstructions,
      "",
      "LOKALT CDA-SPECIALISTPANEL",
      "Specialistpanelet er kun aktiveret, fordi brugeren udtrykkeligt har bedt om det.",
      "Gennemgå hele det kompakte specialistindex og vælg 1-3 relevante specialister ud fra brugerens konkrete beskrivelse, specialisternes keywords og deres fagområder.",
      "Vælg højst 3 specialister. Vælg komplementære faglige perspektiver, når det giver reel værdi, så barnet vurderes bredt og ikke kun gennem en kendt diagnose eller ét fagområde. Skab ikke kunstig bredde, hvis færre perspektiver er tilstrækkelige.",
      "Hver valgt specialist må kun bidrage inden for eget fagområde. CDA skal samle perspektiverne i én praktisk og sammenhængende vurdering frem for tre løsrevne svar.",
      "En kendt diagnose er kontekst, ikke facit. Beskriv relevante mønstre og alternative forklaringer forsigtigt, men sig aldrig, at en diagnose eller komorbiditet er fundet, og foreslå ikke en konkret ny diagnose ud fra en kort beskrivelse.",
      "Hvis observationerne ligger tydeligt uden for det kendte mønster eller kræver egentlig vurdering, anbefal relevante observationer og inddragelse af PPR, teamet eller en relevant specialist. Brug ikke formuleringen 'menneskelig fagperson'.",
      "Giv ingen medicinordination eller juridisk afgørelse.",
      "Svaret skal være dynamisk, rollebaseret og direkte anvendeligt. Vis ikke specialistindex, interne ids, keywords eller udvælgelseslogik.",
      "I normal kort drift: giv højst 3 konkrete handlinger og undgå generiske tilbud om mere hjælp. Et konkret fagligt opfølgende spørgsmål er tilladt, hvis det er nødvendigt for at bringe sagen videre.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Uddyb de relevante specialistperspektiver og deres fælles faglige betydning uden unødvendig gentagelse."
          : "Giv en kort tværfaglig forklaring og konkrete næste skridt.",
    ].join("\n");

    const specialistInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "KOMPAKT SPECIALISTINDEX:",
      specialistPanel.indexText,
    ].join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: specialistInstructions,
      input: specialistInput,
      max_output_tokens:
        response_style === "Dyb"
          ? 1100
          : response_style === "Kort"
            ? 650
            : 850,
      text: {
        format: {
          type: "json_schema",
          name: "cda_specialist_panel_response",
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
    ).slice(0, 3);

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
        phase: "specialist_panel_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["localSpecialistPanelRouting"];
    const toolDebug = [
      {
        name: "localSpecialistPanelRouting",
        selected_specialists: selectedSpecialistIds.map((id) =>
          specialistPanel.specialistSummaries.find(
            (specialist) => specialist.id === id
          )
        ).filter(Boolean),
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
      pending_action: null,
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
      pending_action: null,
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
      pending_action: null,
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
        pending_action: null,
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
      input: message,
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
} catch (error) {
  console.error("CDA chatfejl:", error);

  return res.status(500).json({
    success: false,
    error: "CDA kunne ikke behandle beskeden",
    details: error.message,
  });
}
}
