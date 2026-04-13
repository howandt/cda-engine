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

function isAgeMatch(age, ageRange) {
  if (!age || !Array.isArray(ageRange) || ageRange.length !== 2) return true;
  return age >= ageRange[0] && age <= ageRange[1];
}

function scoreTemplateMatch(template, input) {
  let score = 0;

  const inputText = normalize(input.text);
  const inputTags = normalizeArray(input.tags);
  const inputCategory = normalize(input.category);

  const templateTags = normalizeArray(template.tags);
  const templateCategory = normalize(template.category);

  if (!isAgeMatch(input.age, template.age_range)) {
    return -100;
  }

  for (const tag of templateTags) {
    if (inputText.includes(tag)) score += 10;
    if (inputTags.includes(tag)) score += 20;
  }

  if (inputCategory && templateCategory === inputCategory) {
    score += 25;
  }

  return score;
}

function shouldActivateOverlevering(input) {
  const text = normalize(input.text);
  const tags = normalizeArray(input.tags);

  const schoolTerms = [
    "skolestart",
    "skole",
    "0. klasse",
    "børnehaveklasse",
    "brobygning",
    "overlevering"
  ];

  const hasSchoolText = schoolTerms.some((term) => text.includes(term));
  const hasSchoolTag = tags.some((tag) => schoolTerms.includes(tag));

  return (input.age >= 5 && input.age <= 6 && hasSchoolText) || hasSchoolTag;
}

export function routeBornehaveInput(input = {}) {
  const indexPath = path.join(
    process.cwd(),
    "CDA",
    "templates",
    "bornehave",
    "bornehave_templates_index.json"
  );

  const indexData = readJsonFile(indexPath);
  const templates = Array.isArray(indexData.templates) ? indexData.templates : [];
  const routingLogic = indexData.routing_logic || {};

  const defaultEntry = routingLogic.default_entry || "bh_observation_lobende";
  const transitionEntry = routingLogic.transition_entry || "bh_overlevering_til_skole";

  const matchedTemplates = templates
    .map((template) => ({
      ...template,
      score: scoreTemplateMatch(template, input)
    }))
    .filter((template) => template.score > 0)
    .sort((a, b) => b.score - a.score);

  const priorityTemplates = matchedTemplates
    .filter((template) => template.id !== defaultEntry && template.id !== transitionEntry)
    .slice(0, 3);

  const handoverReady = shouldActivateOverlevering(input);

  const primaryTemplate =
    priorityTemplates.length > 0
      ? priorityTemplates[0].id
      : handoverReady
      ? transitionEntry
      : defaultEntry;

  const flow_templates = [
    defaultEntry,
    ...priorityTemplates.map((template) => template.id),
    ...(handoverReady ? [transitionEntry] : [])
  ];

  const flow_template_objects = templates
    .filter((template) => flow_templates.includes(template.id))
    .sort((a, b) => flow_templates.indexOf(a.id) - flow_templates.indexOf(b.id))
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
        content: templateData
      };
    });

  const primary_template_object =
    flow_template_objects.find((template) => template.id === primaryTemplate) || null;

  return {
    module: indexData.module || "CDA_Bornehavespor",
    version: indexData.version || "1.0",
    entry_template: defaultEntry,
    base_template: defaultEntry,
    primary_template: primaryTemplate,
    primary_template_object,
    flow_templates,
    flow_template_objects,
    matched_behavior_tags: normalizeArray(input.tags),
    matched_category: input.category || null,
    age: input.age || null,
    candidate_templates: matchedTemplates.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      score: t.score,
      file: t.file
    })),
    priority_templates: priorityTemplates.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      score: t.score,
      file: t.file
    })),
    handover_ready: handoverReady,
    handover_template: handoverReady ? transitionEntry : null
  };
}