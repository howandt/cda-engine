import fs from "fs";
import path from "path";

function readTextFile(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) throw new Error(errorMessage);
  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile(filePath, errorMessage) {
  return JSON.parse(readTextFile(filePath, errorMessage));
}

function safeString(value) {
  return String(value || "");
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

export {
  STRUCTURED_DIAGNOSIS_ALIASES,
  containsDiagnosisPhrase,
  normalizeDiagnosisPhrase,
  getDiagnoser,
  findStructuredDiagnosisMatches,
  getSingleStructuredDiagnosisMatch,
  loadStructuredDiagnosis,
  isLocalDiagnosisTheoryRequest,
  getLocalDiagnosisSessionMeta,
  isLocalDiagnosisStop,
  isLocalDiagnosisTheoryFollowup,
  buildLocalDiagnosisSessionPrompt,
  buildLocalDiagnosisTheoryReply,
  buildStructuredDiagnosisContext,
};
