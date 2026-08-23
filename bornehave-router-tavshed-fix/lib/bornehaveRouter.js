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
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
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

function isAgeMatch(age, ageRange) {
  if (!age || !Array.isArray(ageRange) || ageRange.length !== 2) {
    return true;
  }

  return age >= ageRange[0] && age <= ageRange[1];
}

function inferBehaviorTags(text) {
  const normalizedText = normalize(text);

  const rules = {
    observation: [
      "observere",
      "observation",
      "dokumentere",
      "skrive ned",
      "observationsskema",
    ],
    overlevering: [
      "overlevering",
      "skolestart",
      "0 klasse",
      "brobygning",
      "hvad skolen bor vide",
    ],
    social: [
      "social",
      "traekker sig",
      "leger alene",
      "andre born undgar",
      "faellesskab",
    ],
    tilbagetrækning: [
      "tilbagetraekning",
      "traekker sig",
      "isolerer sig",
    ],
    aleneleg: ["leger alene", "aleneleg"],
    uro: [
      "uro",
      "urolig",
      "rastlos",
      "lober rundt",
      "kan ikke sidde stille",
      "konstant i bevaegelse",
    ],
    impulsivitet: [
      "impulsiv",
      "handler for han taenker",
      "handler for hun taenker",
      "kan ikke vente",
      "afbryder",
    ],
    regulering: [
      "regulering",
      "falder ikke til ro",
      "koger over",
      "overbelastet",
    ],
    overgange: [
      "overgang",
      "aktivitetsskift",
      "skifte aktivitet",
      "planer aendres",
    ],
    skift: ["skift", "skifte aktivitet", "rutineaendring"],
    aflevering: [
      "aflevering",
      "vil ikke sige farvel",
      "klynger sig",
    ],
    sprog: [
      "sprog",
      "taler ikke",
      "ikke taler",
      "taler kun hjemme",
      "taler hjemme men ikke",
      "svarer ikke",
      "siger ikke noget",
      "forstar ikke beskeder",
    ],
    tavshed: [
      "tavs",
      "tavst",
      "taler ikke",
      "ikke taler",
      "taler kun hjemme",
      "taler hjemme men ikke",
      "svarer ikke",
      "siger ikke noget",
      "selektiv mutisme",
    ],
    kontakt: ["reagerer ikke pa navn", "ingen kontakt"],
    spisning: ["spisning", "spiser ikke", "mad", "maltid"],
    madundgaelse: [
      "madundgaelse",
      "naegter at spise",
      "meget faa madvarer",
    ],
    maltider: ["maltid", "frokost", "spisning"],
    sensorik: [
      "sensorisk",
      "sensorik",
      "sanser",
      "lyd",
      "beroring",
    ],
    sanseoverbelastning: [
      "sanseoverbelastning",
      "for meget stoj",
      "daekker orerne",
      "overstimuleret",
    ],
    sansesogning: [
      "sansesogende",
      "soger sanser",
      "putter ting i munden",
      "klatrer hele tiden",
    ],
    aggression: ["aggression", "slaar", "skubber", "bider"],
    alarm: ["alarm", "panik", "fare"],
    udbrud: ["udbrud", "sammenbrud", "meltdown", "raserianfald"],
    sikkerhed: ["sikkerhed", "farlig", "i fare"],
    tryghed: ["tryghed", "utryg", "tryg voksen"],
    angst: ["angst", "bange", "panik", "bekymret"],
    separation: ["separation", "klynger sig", "vil ikke sige farvel"],
    leg: ["leg", "leger", "rolleleg"],
    fleksibilitet: ["fleksibilitet", "rigid", "skal vaere pa samme made"],
    samspil: ["samspil", "lege sammen", "turtagning"],
    belastning: ["belastning", "pludselig aendring", "regression"],
    utryghed: ["utryghed", "utryg", "bange for voksen"],
  };

  return Object.entries(rules)
    .filter(([, patterns]) =>
      patterns.some((pattern) => normalizedText.includes(normalize(pattern)))
    )
    .map(([tag]) => normalize(tag));
}

function scoreTemplateMatch(template, input) {
  let score = 0;

  const inputText = normalize(input.text);
  const inputTags = Array.from(
    new Set([
      ...normalizeArray(input.tags),
      ...inferBehaviorTags(input.text),
    ])
  );
  const inputCategory = normalize(input.category);

  const templateTags = normalizeArray(template.tags);
  const templateCategory = normalize(template.category);

  if (!isAgeMatch(input.age, template.age_range)) {
    return -100;
  }

  for (const tag of templateTags) {
    if (` ${inputText} `.includes(` ${tag} `)) score += 10;
    if (inputTags.includes(tag)) score += 20;
  }

  if (inputCategory && templateCategory === inputCategory) {
    score += 25;
  }

  return score;
}

function shouldActivateOverlevering(input) {
  const text = normalize(input.text);
  const tags = Array.from(
    new Set([
      ...normalizeArray(input.tags),
      ...inferBehaviorTags(input.text),
    ])
  );

  const schoolTerms = [
    "skolestart",
    "skole",
    "0 klasse",
    "bornehaveklasse",
    "brobygning",
    "overlevering",
  ];

  const hasSchoolText = schoolTerms.some((term) => text.includes(term));
  const hasSchoolTag = tags.some((tag) => schoolTerms.includes(tag));

  return (
    (input.age >= 5 && input.age <= 6 && hasSchoolText) ||
    hasSchoolTag
  );
}

function isStrongTemplateMatch(templateId, priorityTemplates, transitionEntry) {
  if (!templateId) return false;
  if (templateId === transitionEntry) return true;

  const match = priorityTemplates.find(
    (template) => template.id === templateId
  );

  return Number(match?.score || 0) >= 20;
}

function scoreKnowledgeEntry(
  entry,
  input,
  primaryTemplate,
  defaultEntry,
  transitionEntry,
  flowTemplates,
  priorityTemplates
) {
  const text = normalize(input.text);
  const messageWords = new Set(
    text.split(" ").filter((word) => word.length >= 3)
  );
  const genericWords = new Set([
    "barn",
    "born",
    "bornehave",
    "paedagog",
    "hvordan",
    "hvad",
    "skal",
    "kan",
    "vores",
    "med",
    "for",
    "til",
    "den",
    "det",
    "der",
  ]);

  let score = Math.max(0, 4 - Number(entry?.priority || 3));
  const relatedTemplateIds = Array.isArray(entry?.related_template_ids)
    ? entry.related_template_ids
    : [];

  if (
    primaryTemplate &&
    primaryTemplate !== defaultEntry &&
    relatedTemplateIds.includes(primaryTemplate) &&
    isStrongTemplateMatch(
      primaryTemplate,
      priorityTemplates,
      transitionEntry
    )
  ) {
    score += 36;
  }

  for (const templateId of relatedTemplateIds) {
    if (flowTemplates.includes(templateId)) {
      score += 8;
    }
  }

  const scorePhrases = (values, exactScore, wordScore) => {
    for (const value of Array.isArray(values) ? values : []) {
      const normalizedValue = normalize(value);

      if (!normalizedValue) continue;

      if (text.includes(normalizedValue)) {
        score += exactScore;
        continue;
      }

      const valueWords = normalizedValue
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 && !genericWords.has(word)
        );
      const overlap = valueWords.filter((word) =>
        messageWords.has(word)
      ).length;

      if (overlap > 0) {
        score += Math.min(exactScore - 1, overlap * wordScore);
      }
    }
  };

  scorePhrases(entry?.search_keywords, 24, 3);
  scorePhrases(entry?.tags, 12, 2);
  scorePhrases([entry?.title, entry?.category], 10, 2);

  const intentBoosts = {
    bh_praksis_grundprincipper: [
      "tidlige tegn",
      "ma vi diagnosticere",
      "vores rolle",
      "hvordan stotter vi",
    ],
    bh_uro_opmaerksomhed_og_regulering: [
      "uro",
      "impulsiv",
      "sidde stille",
      "dagdrom",
      "regulering",
      "sensorisk sogende",
    ],
    bh_social_udvikling_leg_og_kommunikation: [
      "leger alene",
      "social",
      "taler ikke",
      "ikke taler",
      "taler kun hjemme",
      "taler hjemme men ikke",
      "svarer ikke",
      "tavs",
      "venskab",
      "dominerer legen",
      "andre born undgar",
    ],
    bh_overgange_tryghed_og_skolestart: [
      "overgang",
      "aflevering",
      "skolestart",
      "overlevering",
      "rutineaendring",
      "brobygning",
    ],
    bh_observation_og_dokumentation: [
      "observere",
      "observation",
      "dokumentere",
      "skrive ned",
      "observationsskema",
    ],
    bh_foraeldresamtale: [
      "foraeldresamtale",
      "tale med foraeldrene",
      "foraeldre bliver defensive",
      "samarbejde med foraeldre",
    ],
    bh_handlingsniveauer: [
      "hvornar skal vi handle",
      "er det normalt",
      "akut",
      "barn i fare",
      "hvornar ppr",
      "bekymringsniveau",
    ],
    bh_tvaerfaglig_hjaelp_og_ressourcer: [
      "hvem kan hjaelpe",
      "hvor soger vi hjaelp",
      "ppr",
      "laege",
      "tvaerfaglig",
    ],
    bh_personalets_faglige_rolle: [
      "jeg er ikke ekspert",
      "usikker paedagog",
      "hvad er min rolle",
      "bange for at gore noget forkert",
    ],
  };

  for (const pattern of intentBoosts[entry?.id] || []) {
    if (text.includes(normalize(pattern))) {
      score += 22;
    }
  }

  return score;
}

function selectPracticeKnowledge(
  guideData,
  input,
  primaryTemplate,
  defaultEntry,
  transitionEntry,
  flowTemplates,
  priorityTemplates
) {
  const entries = Array.isArray(guideData?.knowledge_entries)
    ? guideData.knowledge_entries
    : [];

  const scoredEntries = entries
    .map((entry) => ({
      entry,
      score: scoreKnowledgeEntry(
        entry,
        input,
        primaryTemplate,
        defaultEntry,
        transitionEntry,
        flowTemplates,
        priorityTemplates
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const maxEntries = Math.min(
    3,
    Number(
      guideData?.retrieval_contract
        ?.recommended_max_entries_per_request || 3
    )
  );
  const selectedEntries = [];
  let selectedCharacters = 0;
  const maxCharacters = 5600;

  for (const item of scoredEntries) {
    if (selectedEntries.length >= maxEntries) break;
    if (selectedEntries.length > 0 && item.score < 30) continue;

    const compactEntry = {
      id: item.entry?.id || null,
      title: item.entry?.title || null,
      category: item.entry?.category || null,
      content: item.entry?.content || null,
    };
    const entryCharacters = JSON.stringify(compactEntry).length;

    if (
      selectedEntries.length > 0 &&
      selectedCharacters + entryCharacters > maxCharacters
    ) {
      continue;
    }

    selectedEntries.push(compactEntry);
    selectedCharacters += entryCharacters;
  }

  if (selectedEntries.length === 0) {
    const fallback = entries.find(
      (entry) => entry?.id === "bh_praksis_grundprincipper"
    );

    if (fallback) {
      selectedEntries.push({
        id: fallback.id,
        title: fallback.title,
        category: fallback.category,
        content: fallback.content,
      });
    }
  }

  return {
    source: guideData?.source?.title || null,
    professional_boundaries: Array.isArray(
      guideData?.professional_boundaries
    )
      ? guideData.professional_boundaries
      : [],
    selected_entry_ids: selectedEntries.map((entry) => entry.id),
    entries: selectedEntries,
  };
}

export function routeBornehaveInput(input = {}) {
  const indexPath = path.join(
    process.cwd(),
    "CDA",
    "templates",
    "bornehave",
    "bornehave_templates_index.json"
  );
  const guidePath = path.join(
    process.cwd(),
    "CDA",
    "knowledge",
    "bornehave",
    "CDA_Bornehave_Praksisguide.json"
  );

  const indexData = readJsonFile(indexPath);
  const guideData = readJsonFile(guidePath);
  const templates = Array.isArray(indexData.templates)
    ? indexData.templates
    : [];
  const routingLogic = indexData.routing_logic || {};
  const inferredTags = inferBehaviorTags(input.text);
  const combinedInput = {
    ...input,
    tags: Array.from(
      new Set([
        ...normalizeArray(input.tags),
        ...inferredTags,
      ])
    ),
  };

  const defaultEntry =
    routingLogic.default_entry || "bh_observation_lobende";
  const transitionEntry =
    routingLogic.transition_entry || "bh_overlevering_til_skole";

  const matchedTemplates = templates
    .map((template) => ({
      ...template,
      score: scoreTemplateMatch(template, combinedInput),
    }))
    .filter((template) => template.score > 0)
    .sort((a, b) => b.score - a.score);

  const priorityTemplates = matchedTemplates
    .filter(
      (template) =>
        template.id !== defaultEntry &&
        template.id !== transitionEntry
    )
    .slice(0, 3);

  const handoverReady = shouldActivateOverlevering(combinedInput);
  const primaryTemplate =
    priorityTemplates.length > 0
      ? priorityTemplates[0].id
      : handoverReady
        ? transitionEntry
        : defaultEntry;

  const flowTemplates = Array.from(
    new Set([
      defaultEntry,
      ...priorityTemplates.map((template) => template.id),
      ...(handoverReady ? [transitionEntry] : []),
    ])
  );

  const flowTemplateObjects = templates
    .filter((template) => flowTemplates.includes(template.id))
    .sort(
      (a, b) =>
        flowTemplates.indexOf(a.id) - flowTemplates.indexOf(b.id)
    )
    .map((template) => {
      const templatePath = path.join(
        process.cwd(),
        "CDA",
        "templates",
        "bornehave",
        template.file
      );
      const templateData = readJsonFile(templatePath);

      return {
        id: template.id,
        title: template.title,
        category: template.category,
        type: template.type,
        role:
          template.id === defaultEntry
            ? "base"
            : template.id === transitionEntry
              ? "transition"
              : "support",
        file: template.file,
        content: templateData,
      };
    });

  const primaryTemplateObject =
    flowTemplateObjects.find(
      (template) => template.id === primaryTemplate
    ) || null;

  const practiceKnowledge = selectPracticeKnowledge(
    guideData,
    combinedInput,
    primaryTemplate,
    defaultEntry,
    transitionEntry,
    flowTemplates,
    priorityTemplates
  );

  return {
    module: indexData.module || "CDA_Bornehavespor",
    version: indexData.version || "1.0",
    entry_template: defaultEntry,
    base_template: defaultEntry,
    primary_template: primaryTemplate,
    primary_template_object: primaryTemplateObject,
    flow_templates: flowTemplates,
    flow_template_objects: flowTemplateObjects,
    practice_knowledge: practiceKnowledge,
    matched_behavior_tags: combinedInput.tags,
    matched_category: input.category || null,
    age: input.age || null,
    candidate_templates: matchedTemplates.map((template) => ({
      id: template.id,
      title: template.title,
      category: template.category,
      score: template.score,
      file: template.file,
    })),
    priority_templates: priorityTemplates.map((template) => ({
      id: template.id,
      title: template.title,
      category: template.category,
      score: template.score,
      file: template.file,
    })),
    handover_ready: handoverReady,
    handover_template: handoverReady ? transitionEntry : null,
  };
}
