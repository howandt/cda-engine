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

function getTemplates(args = {}) {
  // 24B.20G: getTemplates() blev tidligere hentet fra data/CDA_Templates.json,
  // som er den gamle database vi arkiverede. Den er bevidst tom, så værktøjet
  // gav intet reelt indhold, når den almindelige samtale spurgte om en
  // skabelon uden at åbne den direkte. Nu hentes fra det samme aktive
  // register (data/CDA_TemplateFiles.json + templates/*.md), som resten af
  // skabelon-motoren bruger, inklusive selve skabelon-teksten, så svar om
  // "hvad siger skabelon X" er baseret på det rigtige indhold.
  const registryResult = getTemplateFiles();
  const templates = Array.isArray(registryResult?.templates)
    ? registryResult.templates
    : [];

  if (args.type === "index") {
    const index = templates.reduce((acc, template) => {
      const key = template.category_id || "andet";

      if (!acc[key]) {
        acc[key] = { category: template.category || key, templates: [] };
      }

      acc[key].templates.push({ id: template.id, title: template.title });
      return acc;
    }, {});

    return {
      success: true,
      source: "local",
      data: index,
    };
  }

  const enrichedTemplates = templates.map((template) => ({
    id: template.id,
    title: template.title,
    category: template.category,
    description: template.description,
    content_file: template.content_file,
    template_markdown: readLocalTemplateMarkdown(template),
  }));

  return {
    success: true,
    source: "local",
    templates: enrichedTemplates,
    total: enrichedTemplates.length,
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

  // 24B.20H: et rent helt-ord-match fanger ikke danske bøjede former som
  // "skolevægringsguiden" eller "dagplanbyggeren". Match derfor ord-for-ord
  // med samme tolerante sammenligning (searchWordMatches), som allerede
  // bruges til at finde og score selve skabelonen, så de to dele af
  // matchningen er kalibreret til hinanden.
  const phraseWords = phrase.split(" ").filter(Boolean);
  const textWords = normalizeTemplateSearch(messageText)
    .split(" ")
    .filter(Boolean);

  if (phraseWords.length === 0 || textWords.length < phraseWords.length) {
    return false;
  }

  for (let start = 0; start <= textWords.length - phraseWords.length; start += 1) {
    const isSequenceMatch = phraseWords.every((phraseWord, offset) =>
      searchWordMatches(phraseWord, textWords[start + offset])
    );

    if (isSequenceMatch) return true;
  }

  return false;
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
      templatePhraseIsPresent(text, pattern)
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

  const templates = Array.isArray(fileTemplateResult?.templates)
    ? fileTemplateResult.templates
    : [];

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
    isKnownTemplateMatch: Boolean(signals.isDirectRequest),
    indirectResourceRequest:
      signals.indirectResourceRequest && !signals.isDirectRequest,
  };
}

function getUniqueTemplateTitles(templates) {
  return Array.from(
    new Set(
      (Array.isArray(templates) ? templates : [])
        .map((template) => String(template?.title || "").trim())
        .filter(Boolean)
    )
  );
}

function cleanTemplateReplyTail(replyText) {
  let text = String(replyText || "").trim();

  const terminalOfferPatterns = [
    /\s*(?:Hvis du vil|Hvis du ønsker det),?\s+kan jeg(?:\s+også)?[\s\S]*?[.!?]\s*$/i,
    /\s*Jeg kan(?:\s+også)?\s+(?:lave|hjælpe|hjælpe dig|omsætte|sætte|skrive|formulere)[\s\S]*?[.!?]\s*$/i,
    /\s*Vil du have,?\s+at jeg[\s\S]*?[.!?]\s*$/i,
    /\s*Sig til,?\s+hvis[\s\S]*?[.!?]\s*$/i,
    /\s*(?:If you want|If you'd like),?\s+I can(?:\s+also)?[\s\S]*?[.!?]\s*$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of terminalOfferPatterns) {
      const next = text.replace(pattern, "").trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }

  return text;
}

function buildTemplateResult({
  reply,
  model = "local",
  action,
  request,
  role,
  responseStyle,
  contentFile = null,
  response = null,
}) {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const totalTokens = Number(
    response?.usage?.total_tokens || inputTokens + outputTokens
  );
  const usage = response
    ? [{
        call: 1,
        phase: "template_resource_engine",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      }]
    : [];
  const usedDataSources = ["data/CDA_TemplateFiles.json"];

  if (contentFile) {
    usedDataSources.push(contentFile);
  }

  return {
    reply,
    model,
    usedTools: ["templateResourceEngineV2"],
    toolDebug: [{
      name: "templateResourceEngineV2",
      action,
      template_id: request?.template?.id || null,
      template_title: request?.template?.title || null,
      content_file: contentFile,
      match_score: request?.score ?? null,
      matched_fields: request?.matchedFields || [],
      matched_words: request?.matchedWords || [],
      total_templates: request?.total ?? null,
      role,
      response_style: responseStyle,
    }],
    usedDataSources,
    usage,
  };
}

async function runTemplateResourceFlow({
  openai,
  model = "gpt-5.4-mini",
  message,
  language = "Dansk",
  role = "Lærer",
  responseStyle = "Kort",
  heidiPrompt = "",
  audienceInstructions = "",
  allowRouting = true,
} = {}) {
  if (!allowRouting) return null;

  const request = getLocalTemplateRequest(message);
  if (!request) return null;

  if (request.type === "list") {
    const titles = getUniqueTemplateTitles(request.templates);
    const reply = [
      language === "English"
        ? `CDA's template bank contains ${titles.length} existing templates:`
        : `CDA's templatebank indeholder ${titles.length} eksisterende skabeloner:`,
      "",
      ...titles.map((title) => `- ${title}`),
    ].join("\n");

    return buildTemplateResult({
      reply,
      action: "list_templates",
      request: { ...request, total: titles.length },
      role,
      responseStyle,
    });
  }

  if (request.type === "not_found") {
    const titles = getUniqueTemplateTitles(request.templates);
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

    return buildTemplateResult({
      reply,
      action: "no_matching_template",
      request,
      role,
      responseStyle,
    });
  }

  const directTemplateFile = getDirectTemplateFileRequest(
    message,
    request.template,
    {
      allowIndirectResourceDisplay:
        request.indirectResourceRequest === true,
    }
  );

  if (directTemplateFile) {
    return buildTemplateResult({
      reply: directTemplateFile.content,
      action: "show_existing_template_direct_file",
      request,
      role,
      responseStyle,
      contentFile: directTemplateFile.contentFile,
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
    `AKTUEL SVARSTIL: ${responseStyle}`,
  ].join("\n");

  const templateInput = [
    "BRUGERENS SPØRGSMÅL:",
    message,
    "",
    "DEN ENE MATCHENDE EKSISTERENDE CDA-SKABELON:",
    JSON.stringify(request.context, null, 2),
  ].join("\n");

  const response = await openai.responses.create({
    model,
    reasoning: { effort: "low" },
    instructions: templateInstructions,
    input: templateInput,
    max_output_tokens: 1600,
  });

  return buildTemplateResult({
    reply: cleanTemplateReplyTail(response.output_text),
    model,
    action: "show_existing_template",
    request,
    role,
    responseStyle,
    response,
  });
}

export {
  getDirectTemplateFileRequest,
  getLocalTemplateRequest,
  getTemplates,
  normalizeTemplateSearch,
  runTemplateResourceFlow,
};
