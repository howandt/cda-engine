import fs from "fs";
import path from "path";

const ROLEPLAY_CONFIG_FILE = "data/CDA_RoleplayEngine.json";
const ROLEPLAY_SCENARIOS_FILE = "data/rollespil_scenarier.json";

function readJsonFile(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getRoleplayConfiguration() {
  return readJsonFile(
    path.join(process.cwd(), "data", "CDA_RoleplayEngine.json"),
    `${ROLEPLAY_CONFIG_FILE} blev ikke fundet`
  );
}

function getRollespil(args = {}) {
  const data = readJsonFile(
    path.join(process.cwd(), "data", "rollespil_scenarier.json"),
    `${ROLEPLAY_SCENARIOS_FILE} blev ikke fundet`
  );
  const scenarios = Array.isArray(data)
    ? data
    : data.scenarier || data.data || [];

  if (args.caseId) {
    const scenario = scenarios.find(
      (item) => String(item.id || "") === String(args.caseId)
    );

    return scenario
      ? { success: true, source: "local", data: scenario }
      : {
          success: false,
          error: `Rollespilscase ikke fundet: ${args.caseId}`,
          available_cases: scenarios.map((item) => item.id).filter(Boolean),
        };
  }

  return {
    success: true,
    source: "local",
    total: scenarios.length,
    data: scenarios,
  };
}

function normalizeRoleplayPhrase(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesConfiguredPhrase(text, phrases) {
  return (Array.isArray(phrases) ? phrases : []).some((phrase) =>
    text.includes(normalizeRoleplayPhrase(phrase))
  );
}

function getRoleplayEntryMode(message, config = getRoleplayConfiguration()) {
  const text = normalizeRoleplayPhrase(message);

  for (const [mode, definition] of Object.entries(config.entry_modes || {})) {
    if (includesConfiguredPhrase(text, definition?.phrases)) {
      return mode;
    }
  }

  return null;
}

function isExactRoleplayEntryPhrase(
  message,
  mode,
  config = getRoleplayConfiguration()
) {
  const text = normalizeRoleplayPhrase(message);
  const phrases = config?.entry_modes?.[mode]?.phrases || [];

  return phrases.some(
    (phrase) => text === normalizeRoleplayPhrase(phrase)
  );
}

function isRoleplayTriggerMessage(message, config = getRoleplayConfiguration()) {
  const text = normalizeRoleplayPhrase(message);
  const activation = config.activation || {};

  if (
    includesConfiguredPhrase(text, activation.direct_phrases) ||
    includesConfiguredPhrase(
      text,
      config?.scenario_library?.explicit_request_phrases
    )
  ) {
    return true;
  }

  return (
    includesConfiguredPhrase(text, activation.practice_verbs) &&
    includesConfiguredPhrase(text, activation.practice_objects)
  );
}

function isRoleplayMenuRequest(message, config = getRoleplayConfiguration()) {
  const text = normalizeRoleplayPhrase(message);

  return (config?.activation?.menu_phrases || []).some(
    (phrase) => text === normalizeRoleplayPhrase(phrase)
  );
}

function isScenarioLibraryRequest(
  message,
  config = getRoleplayConfiguration()
) {
  const text = normalizeRoleplayPhrase(message);
  if (!text) return false;

  return includesConfiguredPhrase(
    text,
    config?.scenario_library?.explicit_request_phrases
  );
}

function findRequestedScenario(message, scenarios) {
  const text = normalizeRoleplayPhrase(message);
  if (!text) return null;

  return (Array.isArray(scenarios) ? scenarios : []).find((scenario) => {
    const id = normalizeRoleplayPhrase(scenario?.id);
    const title = normalizeRoleplayPhrase(scenario?.titel || scenario?.title);

    return (id && text.includes(id)) || (title && text.includes(title));
  }) || null;
}

function buildScenarioLibraryReply(scenarios, language = "Dansk") {
  const availableScenarios = (Array.isArray(scenarios) ? scenarios : [])
    .map((scenario) => ({
      id: cleanText(scenario?.id, 120),
      title: cleanText(scenario?.titel || scenario?.title, 240),
      place: cleanText(scenario?.sted || scenario?.place, 160),
    }))
    .filter((scenario) => scenario.id && scenario.title);

  if (availableScenarios.length === 0) {
    return language === "English"
      ? "There are currently no roleplay scenarios in the scenario library."
      : "Der er i øjeblikket ingen rollespilsscenarier i scenariebiblioteket.";
  }

  const heading = language === "English"
    ? "### Available roleplay scenarios"
    : "### Tilgængelige rollespilsscenarier";
  const lines = availableScenarios.map((scenario) => {
    const place = scenario.place ? ` — ${scenario.place}` : "";
    return `- **${scenario.id}:** ${scenario.title}${place}`;
  });

  return [heading, "", ...lines].join("\n");
}

function getScenarioRoleOptions(scenario) {
  return (Array.isArray(scenario?.roller) ? scenario.roller : [])
    .map((role) => ({
      id: cleanText(role?.id, 120),
      label: cleanText(role?.rolle || role?.role, 160),
    }))
    .filter((role) => role.id);
}

function buildScenarioSetupContext(scenario) {
  const id = cleanText(scenario?.id, 120);
  const title = cleanText(scenario?.titel || scenario?.title, 240);
  const place = cleanText(scenario?.sted || scenario?.place, 160);
  const time = cleanText(scenario?.tid || scenario?.time, 160);

  return [
    "VALGT SCENARIE FRA BIBLIOTEKET",
    id ? `Id: ${id}` : "",
    title ? `Konkret situation: ${title}` : "",
    place ? `Sted: ${place}` : "",
    time ? `Tid: ${time}` : "",
  ].filter(Boolean).join("\n");
}

function buildScenarioRoleQuestion(scenario, language = "Dansk") {
  const title = cleanText(scenario?.titel || scenario?.title, 240);
  const place = cleanText(scenario?.sted || scenario?.place, 160);
  const time = cleanText(scenario?.tid || scenario?.time, 160);
  const roles = getScenarioRoleOptions(scenario).map((role) =>
    role.label ? `${role.id} (${role.label})` : role.id
  );
  const roleList = formatNaturalList(roles, language);

  if (language === "English") {
    return [
      `The scenario is selected: **${title}**`,
      place ? `Place: ${place}` : "",
      time ? `Time: ${time}` : "",
      roleList ? `Available roles: ${roleList}.` : "",
      "",
      "Which role will you have, and which role should CDA play?",
    ].filter((line) => line !== "").join("\n");
  }

  return [
    `Scenariet er valgt: **${title}**`,
    place ? `Sted: ${place}` : "",
    time ? `Tid: ${time}` : "",
    roleList ? `Tilgængelige roller: ${roleList}.` : "",
    "",
    "Hvilken rolle vil du selv have, og hvilken rolle skal CDA spille?",
  ].filter((line) => line !== "").join("\n");
}

function shouldSkipRoleplayPreparation(message, config) {
  return includesConfiguredPhrase(
    normalizeRoleplayPhrase(message),
    config?.state?.skip_preparation_phrases
  );
}

function createRoleplayResult(statusCode, body) {
  return { statusCode, body };
}

const MODEL = "gpt-5.4-mini";
const MAX_HISTORY_ITEMS = 60;
const MAX_HISTORY_CHARS = 40000;
const MAX_MESSAGE_CHARS = 6000;
const MAX_ROLE_EVENTS = 20;
const MAX_INCIDENT_CHARS = 16000;
const MAX_RETRY_HISTORY_ITEMS = 20;

const VALID_STATUSES = new Set([
  "setup",
  "preparation",
  "active",
  "paused",
  "feedback",
  "ended",
]);

const VALID_DIFFICULTIES = new Set(["let", "mellem", "svær"]);
const VALID_MODES = new Set(["roleplay", "incident_analysis"]);
const VALID_RETRY_PHASES = new Set([
  "",
  "awaiting_teacher_rephrase",
  "active",
  "feedback_complete",
]);

function cleanText(value, maxLength = MAX_MESSAGE_CHARS) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeCommand(value) {
  return cleanText(value, 500)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSessionId() {
  return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  const sanitized = history
    .filter((item) => item && ["user", "assistant"].includes(item.role))
    .map((item) => ({
      role: item.role,
      content: cleanText(item.content),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_ITEMS);

  let totalCharacters = sanitized.reduce(
    (sum, item) => sum + item.content.length,
    0
  );

  while (sanitized.length > 2 && totalCharacters > MAX_HISTORY_CHARS) {
    const removed = sanitized.shift();
    totalCharacters -= removed.content.length;
  }

  return sanitized;
}

function sanitizeRoleEvents(rawEvents, historyLength, fallbackUserRole, fallbackCdaRole) {
  const events = Array.isArray(rawEvents)
    ? rawEvents
        .map((event) => ({
          history_index: Math.max(
            0,
            Math.min(historyLength, Number.parseInt(event?.history_index, 10) || 0)
          ),
          user_role: cleanText(event?.user_role, 160),
          cda_role: cleanText(event?.cda_role, 160),
        }))
        .filter((event) => event.user_role && event.cda_role)
        .sort((a, b) => a.history_index - b.history_index)
        .slice(-MAX_ROLE_EVENTS)
    : [];

  if (events.length === 0 && fallbackUserRole && fallbackCdaRole) {
    events.push({
      history_index: 0,
      user_role: fallbackUserRole,
      cda_role: fallbackCdaRole,
    });
  }

  return events;
}

function sanitizeState(rawState = {}) {
  const status = VALID_STATUSES.has(rawState.status)
    ? rawState.status
    : "setup";

  const difficulty = VALID_DIFFICULTIES.has(rawState.difficulty)
    ? rawState.difficulty
    : "mellem";

  const userRole = cleanText(rawState.user_role, 160);
  const cdaRole = cleanText(rawState.cda_role, 160);
  const history = sanitizeHistory(rawState.history);

  const mode = VALID_MODES.has(rawState.mode)
    ? rawState.mode
    : "roleplay";

  const previousMode = VALID_MODES.has(rawState.previous_mode)
    ? rawState.previous_mode
    : "";

  const retryPhase = VALID_RETRY_PHASES.has(rawState.retry_phase)
    ? rawState.retry_phase
    : "";

  const retryHistory = sanitizeHistory(rawState.retry_history).slice(
    -MAX_RETRY_HISTORY_ITEMS
  );

  const retryAttempt = Math.max(
    0,
    Math.min(1000, Number.parseInt(rawState.retry_attempt, 10) || 0)
  );

  return {
    session_id: cleanText(rawState.session_id, 100) || createSessionId(),
    status,
    mode,
    previous_mode: previousMode,
    user_role: userRole,
    cda_role: cdaRole,
    training_type: cleanText(rawState.training_type, 180),
    entry_mode: cleanText(rawState.entry_mode, 40),
    language: rawState.language === "English" ? "English" : "Dansk",
    preparation_asked: rawState.preparation_asked === true,
    preparation_answer: cleanText(rawState.preparation_answer, 3000),
    difficulty,
    scene: cleanText(rawState.scene, 6000),
    incident_case: cleanText(rawState.incident_case, MAX_INCIDENT_CHARS),
    history,
    role_events: sanitizeRoleEvents(
      rawState.role_events,
      history.length,
      userRole,
      cdaRole
    ),
    last_feedback: cleanText(rawState.last_feedback, 6000),
    last_analysis: cleanText(rawState.last_analysis, 10000),
    last_reverse: cleanText(rawState.last_reverse, 10000),
    retry_phase: retryPhase,
    retry_history: retryHistory,
    retry_attempt: retryAttempt,
    last_retry_feedback: cleanText(rawState.last_retry_feedback, 6000),
  };
}

function extractRole(message, subject) {
  const text = cleanText(message, 1200);

  const patterns =
    subject === "user"
      ? [
          /\bjeg\s+(?:spiller|er)\s+(?:rollen\s+som\s+)?([^,.!?]+?)(?=\s+(?:og|mens|du\s+spiller|du\s+er)\b|[,.!?]|$)/i,
          /\bmin\s+rolle\s+er\s+([^,.!?]+)/i,
        ]
      : [
          /\bdu\s+(?:spiller|er)\s+(?:rollen\s+som\s+)?([^,.!?]+?)(?=\s+(?:og|mens|jeg\s+spiller|jeg\s+er)\b|[,.!?]|$)/i,
          /\bcda\s+(?:spiller|er)\s+(?:rollen\s+som\s+)?([^,.!?]+?)(?=\s+(?:og|mens|jeg\s+spiller|jeg\s+er)\b|[,.!?]|$)/i,
          /\bdin\s+rolle\s+er\s+([^,.!?]+)/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1], 160);
  }

  return "";
}

// Dynamisk kontrol af rollefordeling og om den valgte traeningsform har nok
// konkret indhold til at starte. Kontrollen maa aldrig udfylde selve scenen.
async function assessRoleplaySetupWithAI(
  openai,
  message,
  entryMode,
  assessmentRule = ""
) {
  const text = cleanText(message, MAX_MESSAGE_CHARS);

  if (!text) {
    return {
      user_role: "",
      cda_role: "",
      has_situation: false,
      has_topic: false,
      has_goal: false,
      has_challenge: false,
    };
  }

  try {
    const response = await openai.responses.create({
      model: MODEL,
      reasoning: {
        effort: "low",
      },
      instructions: [
        "Du kontrollerer opsætningen til CDA's rollespil ud fra brugerens egne oplysninger.",
        `Valgt træningsform: ${entryMode || "situation"}.`,
        "user_role: den rolle brugeren selv vil have (fx 'lærer', 'forælder').",
        "cda_role: den rolle AI'en/CDA skal spille (fx 'PPR', 'en skeptisk forælder', 'eleven').",
        "Forstå naturligt sprog, tastefejl (fx 'jer' for 'jeg') og vendt rækkefølge.",
        "Hvis en rolle slet ikke nævnes eller er uklar, returnér tom streng for den.",
        "has_situation er kun sand, hvis brugeren har beskrevet, hvad der konkret sker, skal trænes eller er vanskeligt. Roller og en startkommando alene er ikke en situation.",
        "has_topic er kun sand, hvis samtalens konkrete emne eller baggrund fremgår.",
        "has_goal er kun sand, hvis det fremgår, hvad brugeren vil opnå med samtalen.",
        "has_challenge er sand, hvis en vanskelig forventet reaktion, formulering eller tydelig udfordring fremgår. En konkret modpartsbeskrivelse som 'skeptisk forælder' kan tælle som udfordring.",
        assessmentRule,
        "Opfind aldrig roller, situation, emne, mål eller udfordring, som ikke er antydet i beskeden.",
      ].join("\n"),
      input: text,
      max_output_tokens: 400,
      text: {
        format: {
          type: "json_schema",
          name: "roleplay_setup_assessment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              user_role: { type: "string" },
              cda_role: { type: "string" },
              has_situation: { type: "boolean" },
              has_topic: { type: "boolean" },
              has_goal: { type: "boolean" },
              has_challenge: { type: "boolean" },
            },
            required: [
              "user_role",
              "cda_role",
              "has_situation",
              "has_topic",
              "has_goal",
              "has_challenge"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    if (response.status === "incomplete") {
      console.error("CDA rollespil opsætningskontrol: ufuldstændigt svar fra AI", {
        message: text,
      });
      throw new Error("Ufuldstændigt svar fra rollespillets opsætningskontrol");
    }

    const parsed = JSON.parse(response.output_text || "{}");

    return {
      user_role: cleanText(parsed.user_role, 160),
      cda_role: cleanText(parsed.cda_role, 160),
      has_situation: parsed.has_situation === true,
      has_topic: parsed.has_topic === true,
      has_goal: parsed.has_goal === true,
      has_challenge: parsed.has_challenge === true,
    };
  } catch (error) {
    console.error("CDA rollespil opsætningskontrol fejlede:", error);
    throw new Error("Rollespillets opsætningskontrol kunne ikke gennemføres");
  }
}

function getRoleplaySetupDefinition(config, entryMode) {
  const setupConfig = config?.setup_requirements;
  const defaultMode = cleanText(setupConfig?.default_mode, 40) || "situation";
  const selectedMode = setupConfig?.modes?.[entryMode]
    ? entryMode
    : defaultMode;
  const definition = setupConfig?.modes?.[selectedMode];

  if (!definition || !Array.isArray(definition.required_fields)) {
    throw new Error(
      `Opsætningskrav mangler for rollespilstypen: ${selectedMode}`
    );
  }

  return { setupConfig, selectedMode, definition };
}

function formatNaturalList(values, language) {
  if (values.length <= 1) return values[0] || "";

  const conjunction = language === "English" ? " and " : " og ";
  return `${values.slice(0, -1).join(", ")}${conjunction}${values.at(-1)}`;
}

function buildMissingSetupQuestion(
  config,
  entryMode,
  missingFields,
  language
) {
  const { setupConfig, definition } = getRoleplaySetupDefinition(
    config,
    entryMode
  );
  const selectedLanguage = language === "English" ? "English" : "Dansk";
  const questions = definition?.questions?.[selectedLanguage] || {};

  if (missingFields.length === definition.required_fields.length && questions.all) {
    return cleanText(questions.all, 1200);
  }

  if (missingFields.length === 1 && questions[missingFields[0]]) {
    return cleanText(questions[missingFields[0]], 1200);
  }

  const labels = setupConfig?.field_labels?.[selectedLanguage] || {};
  const missingLabels = missingFields
    .map((field) => cleanText(labels[field], 200))
    .filter(Boolean);
  const template = cleanText(
    setupConfig?.multiple_missing_template?.[selectedLanguage],
    600
  );

  if (!template || missingLabels.length !== missingFields.length) {
    throw new Error("Spørgsmål til manglende rollespilsoplysninger er ikke konfigureret");
  }

  return template.replace(
    "{fields}",
    formatNaturalList(missingLabels, selectedLanguage)
  );
}

async function assessRoleplaySetup({
  openai,
  config,
  entryMode,
  context,
  userRole = "",
  cdaRole = "",
} = {}) {
  const { selectedMode, definition } = getRoleplaySetupDefinition(
    config,
    entryMode
  );
  const assessment = await assessRoleplaySetupWithAI(
    openai,
    context,
    selectedMode,
    cleanText(definition.assessment_rule, 1200)
  );
  const resolvedUserRole = cleanText(userRole, 160) || assessment.user_role;
  const resolvedCdaRole = cleanText(cdaRole, 160) || assessment.cda_role;
  const availableFields = {
    user_role: Boolean(resolvedUserRole),
    cda_role: Boolean(resolvedCdaRole),
    situation: assessment.has_situation,
    topic: assessment.has_topic,
    goal: assessment.has_goal,
    challenge: assessment.has_challenge,
  };
  const missingFields = definition.required_fields.filter(
    (field) => availableFields[field] !== true
  );

  return {
    selectedMode,
    userRole: resolvedUserRole,
    cdaRole: resolvedCdaRole,
    missingFields,
  };
}

function inferTrainingType(message, userRole, cdaRole) {
  const text = normalizeCommand(
    `${message} ${userRole || ""} ${cdaRole || ""}`
  );

  if (
    text.includes("skole hjem") ||
    text.includes("foraeldremode") ||
    text.includes("ppr") ||
    text.includes("leder") ||
    text.includes("kollega") ||
    text.includes("mode")
  ) {
    return "mødetræning";
  }

  if (
    text.includes("elev") ||
    text.includes("barn") ||
    text.includes("dreng") ||
    text.includes("pige")
  ) {
    return "barnesamtale";
  }

  return "generelt rollespil";
}

function inferDifficulty(message, explicitDifficulty = "", fallback = "mellem") {
  const explicit = cleanText(explicitDifficulty, 20).toLowerCase();
  if (VALID_DIFFICULTIES.has(explicit)) return explicit;

  const text = normalizeCommand(message);
  const statedDifficulty =
    text.match(/\b(?:svaerhedsgrad|niveau)\s+(let|mellem|svaer)\b/)?.[1] ||
    text.match(/\b(let|mellem|svaer)\s+(?:svaerhedsgrad|niveau)\b/)?.[1] ||
    text.match(/\b(?:paa|med)\s+(let|mellem|svaer)\s+(?:svaerhedsgrad|niveau)\b/)?.[1] ||
    "";

  if (statedDifficulty === "svaer") return "svær";
  if (statedDifficulty === "let") return "let";
  if (statedDifficulty === "mellem") return "mellem";

  return VALID_DIFFICULTIES.has(fallback) ? fallback : "mellem";
}

function detectConfiguredControlAction(message, config) {
  const text = normalizeCommand(message);

  if (!text) return "";

  for (const definition of Object.values(config?.control_commands || {})) {
    const action = normalizeCommand(definition?.action).replace(/\s+/g, "_");
    const exactPhrases = Array.isArray(definition?.exact_phrases)
      ? definition.exact_phrases
      : [];
    const prefixPhrases = Array.isArray(definition?.prefix_phrases)
      ? definition.prefix_phrases
      : [];

    if (
      exactPhrases.some((phrase) => text === normalizeCommand(phrase)) ||
      prefixPhrases.some((phrase) => {
        const prefix = normalizeCommand(phrase);
        return prefix && (text === prefix || text.startsWith(`${prefix} `));
      })
    ) {
      return action;
    }
  }

  return "";
}

function isExactConfiguredControlPhrase(message, config, commandName) {
  const text = normalizeCommand(message);
  const exactPhrases =
    config?.control_commands?.[commandName]?.exact_phrases || [];

  return exactPhrases.some(
    (phrase) => text === normalizeCommand(phrase)
  );
}

function detectAction(message, state, explicitAction, config) {
  const explicit = normalizeCommand(explicitAction).replace(/\s+/g, "_");
  const allowed = new Set([
    "start",
    "turn",
    "pause",
    "continue",
    "switch_role",
    "feedback",
    "hint",
    "new_roleplay",
    "new_scene",
    "stop",
    "reset",
    "help",
    "analyze_incident",
    "reverse_incident",
    "retry_incident",
    "retry_incident_turn",
    "retry_required",
  ]);

  if (allowed.has(explicit)) return explicit;
  if (["incident_analysis", "analyse_incident", "haendelsesanalyse"].includes(explicit)) {
    return "analyze_incident";
  }
  if (["reverse", "reverse_incident", "vend_situationen", "perspektivskifte"].includes(explicit)) {
    return "reverse_incident";
  }
  if (["retry", "retry_incident", "prov_igen", "proev_igen"].includes(explicit)) {
    return "retry_incident";
  }

  const text = normalizeCommand(message);
  const wordCount = text ? text.split(" ").length : 0;

  if (!text) return state.status === "active" ? "turn" : "help";

  const configuredControlAction = detectConfiguredControlAction(
    message,
    config
  );

  if (allowed.has(configuredControlAction)) {
    return configuredControlAction;
  }

  const isShortCommand = wordCount <= 12;

  if (
    /\b(?:reverse|revers|byt|bytte|skift|skifte)\b/.test(text) &&
    (
      /\b(?:du|cda)\s+(?:er|spiller)\b/.test(text) ||
      /\bjeg\s+(?:er|spiller)\b/.test(text) ||
      /\brolle(?:r|rne)?\b/.test(text)
    )
  ) {
    return "switch_role";
  }

  if (
    isShortCommand &&
    /^(?:prov igen|lad mig prove igen|jeg vil prove igen|nyt forsog)(?: med en ny formulering)?$/.test(text)
  ) {
    return "retry_incident";
  }

  if (
    /\breverse(?:r)?\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet|case)\b/.test(text) ||
    /\brevers\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet|case)\b/.test(text) ||
    /\bvend\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet|case)\b/.test(text) ||
    /\bvis\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet)\s+fra\s+(?:barnets|elevens)\s+(?:side|perspektiv)\b/.test(text) ||
    /\bse\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet)\s+fra\s+(?:barnets|elevens)\s+(?:side|perspektiv)\b/.test(text) ||
    /\bhvordan\s+kan\s+(?:barnet|eleven)\s+have\s+(?:modtaget|hoert|oplevet)\s+(?:min|beskeden|situationen)\b/.test(text)
  ) {
    return "reverse_incident";
  }

  if (
    /\b(?:analyser|analyserer|analyse)\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet)\b/.test(text) ||
    /\bhvad\s+sagde\s+jeg\s+forkert\b/.test(text) ||
    /\bhvad\s+kunne\s+jeg\s+have\s+gjort\s+anderledes\b/.test(text) ||
    /\bhvordan\s+kan\s+jeg\s+goere\s+det\s+bedre\s+naeste\s+gang\b/.test(text) ||
    /\bhvordan\s+undgaar\s+jeg\s+at\s+det\s+sker\s+igen\b/.test(text) ||
    /\bhjaelp\s+mig\s+med\s+at\s+forstaa\s+(?:haendelsen|situationen|konflikten|forlobet)\b/.test(text) ||
    /\bjeg\s+vil\s+(?:gerne\s+)?analysere\s+(?:en\s+)?(?:haendelse|situation|konflikt)\b/.test(text)
  ) {
    return "analyze_incident";
  }

  if (
    text.includes("feedback") ||
    text.includes("debrief") ||
    text.includes("evaluering") ||
    text.includes("vurder min") ||
    text.includes("giv mig en vurdering") ||
    (text.includes("stop") &&
      /\brollespil(?:let)?\b/.test(text) &&
      text.includes("raad"))
  ) {
    return "feedback";
  }

  if (
    isShortCommand &&
    (/^(?:pause|pauser)(?:\s+(?:rollespil(?:let)?|scenen?))?$/.test(text) ||
      /^saet\s+(?:rollespil(?:let)?|scenen?)\s+paa\s+pause$/.test(text))
  ) {
    return "pause";
  }

  if (
    isShortCommand &&
    (/^fortsaet(?:\s+(?:rollespil(?:let)?|scenen?))?$/.test(text) ||
      /^fortsaet\s+hvor\s+vi\s+slap$/.test(text))
  ) {
    return "continue";
  }

  if (
    isShortCommand &&
    (/^skift\s+rolle(?:r|rne)?$/.test(text) ||
      /^byt\s+rolle(?:r|rne)?$/.test(text) ||
      /^lad\s+os\s+(?:skifte|bytte)\s+rolle(?:r|rne)?$/.test(text))
  ) {
    return "switch_role";
  }

  if (
    isShortCommand &&
    (/^(?:hint|tip)$/.test(text) ||
      /^giv\s+(?:mig\s+)?et\s+(?:hint|tip)$/.test(text) ||
      /^hjaelp\s+mig\s+lidt$/.test(text))
  ) {
    return "hint";
  }

  if (
    text.startsWith("ny scene") ||
    text.startsWith("nyt scenarie") ||
    text.startsWith("start en ny scene") ||
    text.startsWith("start et nyt scenarie")
  ) {
    return "new_scene";
  }

  if (
    isShortCommand &&
    (/^(?:stop|slut|afslut)(?:\s+(?:rollespil(?:let)?|scenen?))?$/.test(text) ||
      /^stop\s+nu$/.test(text))
  ) {
    return "stop";
  }

  if (
    wordCount <= 8 &&
    /^(?:reset|nulstil)(?:\s+(?:rollespil(?:let)?|scenen?))?$/.test(text)
  ) {
    return "reset";
  }

  if (
    text.includes("hvordan bruger") ||
    text.includes("forklar hvordan") ||
    text === "hjaelp" ||
    text === "help"
  ) {
    return "help";
  }

  // 23B.9R: Saa laenge status er "setup" (dvs. opstarten reelt ikke er
  // fuldfoert, typisk fordi roller mangler), skal ENHVER almindelig besked
  // tolkes som et forsoeg paa at fuldfoere opstarten -- ikke kun de faste
  // vendinger herunder. Mere specifikke kommandoer (stop/pause/reset/hjaelp
  // m.fl.) er allerede tjekket og returneret tidligere i denne funktion,
  // saa de rammes stadig korrekt uanset denne regel.
  if (
    state.status === "setup" ||
    state.status === "preparation" ||
    state.status === "ended" ||
    (!state.user_role && !state.cda_role)
  ) {
    return "start";
  }

  if (
    state.mode === "incident_analysis" &&
    state.retry_phase === "feedback_complete"
  ) {
    return "retry_required";
  }

  if (
    state.mode === "incident_analysis" &&
    ["awaiting_teacher_rephrase", "active"].includes(state.retry_phase)
  ) {
    return "retry_incident_turn";
  }

  if (state.mode === "incident_analysis") {
    return "analyze_incident";
  }

  return "turn";
}

function isBareIncidentAnalysisCommand(message) {
  const text = normalizeCommand(message);

  return (
    /^(?:analyser|analyse)\s+(?:denne\s+)?(?:haendelse|haendelsen|situationen|konflikten|forlobet)$/.test(text) ||
    /^hvad\s+sagde\s+jeg\s+forkert$/.test(text) ||
    /^hvad\s+kunne\s+jeg\s+have\s+gjort\s+anderledes$/.test(text) ||
    /^hjaelp\s+mig\s+med\s+at\s+forstaa\s+(?:haendelsen|situationen|konflikten|forlobet)$/.test(text)
  );
}

function mergeIncidentCase(existingCase, message) {
  const existing = cleanText(existingCase, MAX_INCIDENT_CHARS);
  const addition = cleanText(message, MAX_MESSAGE_CHARS);

  if (!addition || isBareIncidentAnalysisCommand(addition)) return existing;
  if (!existing) return addition;

  return cleanText(
    `${existing}\n\nSupplerende oplysning:\n${addition}`,
    MAX_INCIDENT_CHARS
  );
}

function buildFeedbackHeadingInstruction(state) {
  const config = getRoleplayConfiguration();
  const language = state.language === "English" ? "English" : "Dansk";
  const headings = config?.output_contract?.feedback_headings?.[language];
  const headingRule = cleanText(
    config?.output_contract?.feedback_heading_rule,
    1000
  );

  if (!Array.isArray(headings) || headings.length !== 3 || !headingRule) {
    throw new Error("Feedbackoverskrifter mangler i CDA_RoleplayEngine.json");
  }

  return [
    headingRule,
    ...headings.map((heading) => `## ${cleanText(heading, 240)}`),
  ].join("\n");
}

function buildRoleplayInstructions(state, action) {
  if (action === "reverse_incident") {
    return [
      "Du er CDA's dynamiske kommunikations-, trænings- og refleksionsmotor.",
      "Du skal reverse den KONKRETE gemte hændelse og vise, hvordan den kan være landet hos barnet eller eleven.",
      "Brug hændelsens præcise sted, forløb, lærerens ord og barnets faktiske reaktion. Erstat aldrig hændelsen med et generelt eksempel, en anden scene eller en opdigtet formulering.",
      "Start tydeligt med overskriften 'Muligt elevperspektiv'. Perspektivet er en faglig hypotese, ikke sikker viden om barnets tanker.",
      "Du må gerne skrive et kort førstepersonsperspektiv som en mulig indre oplevelse, men markér det klart med formuleringer som 'Det kan have lydt sådan for eleven:' eller 'Et muligt indre perspektiv kan være:'.",
      "Citer lærerens centrale ord ordret fra hændelsen og forklar kort, hvad netop hver del kan have signaleret til eleven.",
      "Knyt perspektivet til det, der skete lige før, under og efter. Peg på det konkrete vendepunkt, hvor belastning kan være blevet til eskalation.",
      "Beskriv ikke barnets tanker, følelser, motiv eller diagnose som sikre fakta. Brug 'kan have', 'muligvis' og 'kan være blevet oplevet som'.",
      "Hvis en diagnose er nævnt, må den kun bruges som mulig kontekst. Den må ikke blive hele forklaringen og må ikke bruges til at stille ny diagnose eller påstå komorbiditet.",
      "Slut med 'Hvad læreren kan lære af reverseringen' og én konkret alternativ formulering til samme øjeblik.",
      "Svar praksisnært og konkret. Undgå generelle råd, der kunne passe på enhver situation.",
    ].join("\n");
  }

  if (action === "analyze_incident") {
    return [
      "Du er CDA's dynamiske trænings-, refleksions- og konfliktløsningsmotor.",
      "Du analyserer en konkret skole- eller elevhændelse for at hjælpe læreren eller pædagogen med at lære af forløbet.",
      "Du må ikke placere skyld hos læreren eller barnet. Du skal være direkte, respektfuld og praksisnær.",
      "Skeln tydeligt mellem det, der er observeret, og det, der kun er en mulig forklaring.",
      "Beskriv aldrig barnets tanker eller følelser som sikre fakta. Brug formuleringer som 'kan have oplevet', 'kan have hørt' eller 'muligvis'.",
      "Hvis en diagnose nævnes, må den bruges som relevant kontekst, men den må aldrig forklare hele barnet eller bruges til at stille en ny diagnose.",
      "Ved tegn på noget ud over en kendt diagnose må du neutralt beskrive afvigelsen og pege på observationer eller faglig drøftelse som næste skridt. Påstå aldrig, at komorbiditet er fundet.",
      "Undersøg dynamisk: hvad der skete før, lærerens konkrete ord eller handling, sted og timing, barnets reaktion og hvad der skete bagefter.",
      "Peg især på mulige belastninger som uklarhed, for mange krav på én gang, offentligt pres, tab af kontrol, skift, ventetid, sansebelastning eller oplevet uretfærdighed, men kun når den konkrete hændelse giver grundlag for det.",
      "Brug ikke en statisk diagnoseopskrift. Analysen skal udspringe af den konkrete hændelse.",
      "Svar med fire korte dele: 1) Hvad der ser ud til at være vendepunktet, 2) Hvordan beskeden kan være blevet modtaget, 3) Hvad læreren kan prøve næste gang, 4) Hvilken vigtig oplysning der eventuelt mangler.",
      "Giv mindst én færdig, konkret alternativ formulering, som læreren kan bruge næste gang.",
      "Stil højst ét kort opklarende spørgsmål, og kun hvis det vil ændre vurderingen væsentligt.",
    ].join("\n");
  }

  if (action === "retry_incident_turn") {
    return [
      "Du er CDA's kommunikations-, trænings- og refleksionsmotor i funktionen 'Prøv igen'.",
      "Brugeren er læreren eller pædagogen og afprøver en ny formulering i den samme konkrete hændelse.",
      "Du skal svare UDELUKKENDE som barnet eller eleven i det konkrete øjeblik.",
      "Giv ingen analyse, feedback, forklaring, overskrift, vurdering eller forslag til læreren i dette svar.",
      "Reagér realistisk på lærerens præcise ord ud fra den gemte hændelse, den tidligere analyse og eventuelle reverse.",
      "Barnet må gerne være vredt, afvisende, usikkert, mere roligt eller delvist samarbejdende, hvis formuleringen giver grund til det. Gør ikke en bedre formulering til en automatisk succes.",
      "Fasthold sted, personer, konflikt, timing og barnets kendte reaktion. Opfind ikke nye alvorlige hændelser, diagnoser eller baggrundsfakta.",
      "Hvis barnets indre oplevelse er usikker, skal du stadig spille en plausibel reaktion uden at fremstille dine antagelser som dokumenterede fakta.",
      "Svar med én kort og naturlig rolletur. Direkte tale er hovedformen; kort kropssprog kan tilføjes, hvis det er relevant.",
    ].join("\n");
  }

  if (
    action === "feedback" &&
    state.mode === "incident_analysis" &&
    state.retry_history.length > 0
  ) {
    const feedbackHeadingInstruction = buildFeedbackHeadingInstruction(state);

    return [
      "Du er ude af barnets rolle og giver faglig feedback på lærerens seneste 'Prøv igen'-forsøg i den konkrete hændelse.",
      "Vurdér kun den formulering og de handlinger, læreren faktisk afprøvede, samt barnets efterfølgende reaktion.",
      "Knyt feedbacken til den oprindelige hændelse, hændelsesanalysen og eventuel reverse. Bland ikke andre cases eller generelle standardsvar ind.",
      "Skeln mellem det, der kan ses i replikken, og det, der kun er en mulig effekt hos barnet.",
      feedbackHeadingInstruction,
      "Brug ingen point, stjerner, overdreven ros eller facit-sprog.",
    ].join("\n");
  }

  const difficultyInstruction =
    state.difficulty === "let"
      ? "Vær samarbejdende og giv tydelige åbninger, men stadig realistisk."
      : state.difficulty === "svær"
        ? "Giv tydeligt, realistisk modspil. Misforståelser, modstand og følelsesmæssige reaktioner må opstå naturligt, men ikke kunstigt eller teatralsk."
        : "Giv realistisk modspil med en naturlig balance mellem åbenhed og modstand.";

  const commonRules = [
    "Du er den separate CDA-rollespilsmotor.",
    "Dette modul er kun aktivt, fordi brugeren udtrykkeligt har startet eller fortsat et rollespil.",
    `DEN AKTUELLE ROLLELÅS HAR ABSOLUT PRIORITET: Brugeren spiller ${state.user_role}, og CDA spiller ${state.cda_role}.`,
    `Svar udelukkende som ${state.cda_role}. Svar aldrig som ${state.user_role}.`,
    "Tidligere replikker kan være skrevet før et rolleskift. De viser kun forløbet og må aldrig få dig til at fortsætte den tidligere CDA-rolle.",
    "Den oprindelige scenetekst kan indeholde gamle rolleangivelser. Aktuelle roller i rolle-låsen ovenfor gælder altid.",
    "Fasthold personer, relationer, roller og konkrete fakta fra hele det aktuelle forløb.",
    "Reagér dynamisk på brugerens faktiske ord. Brug ikke faste replikker, faste følelsesforløb eller et skjult facit.",
    "Giv én naturlig rolletur ad gangen.",
    "Giv ikke råd, analyse eller feedback under selve scenen.",
    "Kropssprog, pauser og tone må beskrives kort, når det passer naturligt, men må ikke overdrives.",
    "Du må gerne være skeptisk, vred, usikker, afvisende, samarbejdende eller ændre holdning, når samtalen giver grund til det.",
    "Opfind ikke nye alvorlige hændelser, diagnoser eller fakta, som brugeren ikke har givet.",
    "Ved alvorlige hændelser skal rollen reagere realistisk på alvoren uden at skifte til rådgiver, medmindre handlingen er feedback eller hint.",
    difficultyInstruction,
  ];

  if (action === "feedback") {
    const feedbackHeadingInstruction = buildFeedbackHeadingInstruction(state);

    return [
      "Du er nu ude af rollen og giver faglig feedback på det gennemførte rollespil.",
      `Brugeren spiller aktuelt ${state.user_role}. CDA spiller modparten ${state.cda_role}.`,
      `Vurdér og hjælp kun brugerens kommunikation og handlinger som ${state.user_role}. Giv ikke brugeren råd som ${state.cda_role}.`,
      "Brug kun det konkrete forløb nedenfor. Bland aldrig andre cases eller generelle eksempler ind.",
      "Fasthold rolleperioderne før og efter eventuelle rolleskift.",
      "Nævn de vigtigste konkrete formuleringer og hændelser fra forløbet.",
      "Beskriv kort: hvad der virkede, hvad der kunne eskalere eller skabe misforståelser, og én bedre formulering eller næste handling.",
      feedbackHeadingInstruction,
      "Ved alvorlige hændelser skal feedbacken afspejle alvoren tydeligt og ikke udglatte den.",
      "Brug ingen pladsholdere som [konkret adfærd]. Skriv den færdige formulering direkte.",
      "Brug ikke point, stjerner eller overdreven ros.",
    ].join("\n");
  }

  if (action === "hint") {
    return [
      "Du er kort ude af rollen og giver ét lille hint til brugeren.",
      `Brugeren spiller aktuelt ${state.user_role}. CDA spiller modparten ${state.cda_role}.`,
      `Hintet skal hjælpe brugeren med, hvad brugeren kan sige eller gøre som ${state.user_role} i næste tur.`,
      `Giv aldrig brugeren råd, som hører til rollen ${state.cda_role}.`,
      "Svar ikke som en figur i selve rollespillet.",
      "Hintet skal hjælpe videre uden at give hele løsningen eller evaluere hele forløbet.",
      "Brug højst 2 korte sætninger.",
    ].join("\n");
  }

  return commonRules.join("\n");
}

function getRolesAtHistoryIndex(state, index) {
  let activeRoles = {
    user_role: state.user_role,
    cda_role: state.cda_role,
  };

  for (const event of state.role_events || []) {
    if (event.history_index <= index) {
      activeRoles = {
        user_role: event.user_role,
        cda_role: event.cda_role,
      };
    } else {
      break;
    }
  }

  return activeRoles;
}

function formatHistory(state) {
  if (!state.history.length) return "(Intet tidligere rollespilsforløb)";

  const switchEvents = new Map(
    (state.role_events || [])
      .filter((event) => event.history_index > 0)
      .map((event) => [event.history_index, event])
  );

  const lines = [];

  state.history.forEach((item, index) => {
    const switchEvent = switchEvents.get(index);
    if (switchEvent) {
      lines.push(
        `--- ROLLESKIFT: Fra dette punkt spiller brugeren ${switchEvent.user_role}, og CDA spiller ${switchEvent.cda_role}. ---`
      );
    }

    const roles = getRolesAtHistoryIndex(state, index);
    const speaker =
      item.role === "user"
        ? `BRUGER SOM ${roles.user_role}`
        : `CDA SOM ${roles.cda_role}`;

    lines.push(`${index + 1}. ${speaker}: ${item.content}`);
  });

  const pendingSwitch = switchEvents.get(state.history.length);
  if (pendingSwitch) {
    lines.push(
      `--- AKTUELT ROLLESKIFT: Den næste brugerreplik siges som ${pendingSwitch.user_role}, og CDA skal svare som ${pendingSwitch.cda_role}. ---`
    );
  }

  return lines.join("\n");
}

function formatIncidentRetryHistory(state) {
  if (!state.retry_history.length) {
    return "(Intet 'Prøv igen'-forløb endnu)";
  }

  return state.retry_history
    .map((item, index) => {
      const speaker =
        item.role === "user"
          ? "LÆRER/PÆDAGOG"
          : "BARN/ELEV";

      return `${index + 1}. ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function buildModelInput(state, action, message) {
  if (action === "scenario_opening") {
    return [
      "ÅBNING AF VALGT SCENARIE",
      `CDA spiller ${state.cda_role}. Brugeren spiller ${state.user_role}.`,
      "Ingen har endnu sagt en replik inde i scenen.",
      "Svar derfor ikke på rollevalget eller på en opdigtet tidligere replik.",
      "Åbn scenen med én naturlig rolletur som CDA's aktuelle rolle, tydeligt forankret i den valgte situation.",
      "Giv ingen råd, analyse eller forklaring.",
      "",
      "DEN VALGTE NEUTRALE RAMME",
      state.scene,
    ].join("\n");
  }

  if (action === "reverse_incident") {
    return [
      "REVERSE AF KONKRET HÆNDELSE — HØJESTE PRIORITET",
      `Brugerens faglige rolle: ${state.user_role || "lærer/pædagog"}`,
      "Reverse betyder her perspektivskifte og læring — ikke blot at bytte roller.",
      "Brug kun oplysningerne nedenfor. Bevar lærerens ord og barnets observerede reaktion ordret, når de er tilgængelige.",
      "Hvis noget om barnets indre oplevelse ikke kan vides, skal det fremstilles som en mulighed.",
      "",
      "DEN GEMTE KONKRETE HÆNDELSE",
      state.incident_case || "Ingen særskilt hændelsesbeskrivelse er gemt.",
      "",
      "TIDLIGERE HÆNDELSESANALYSE",
      state.last_analysis || "Ingen tidligere analyse.",
      "",
      "EVENTUELT TRÆNINGSFORLØB",
      formatHistory(state),
      "",
      "BRUGERENS REVERSE-ANMODNING",
      message || "Reverse situationen fra elevens mulige perspektiv.",
    ].join("\n");
  }

  if (action === "analyze_incident") {
    return [
      "HÆNDELSESANALYSE — HØJESTE PRIORITET",
      `Brugerens faglige rolle: ${state.user_role || "lærer/pædagog"}`,
      "Formålet er læring, konfliktløsning og en bedre næste handling — ikke skyld eller diagnose.",
      "",
      "DEN BESKREVNE HÆNDELSE OG SUPPLERENDE OPLYSNINGER",
      state.incident_case || "Ingen særskilt hændelsesbeskrivelse er gemt endnu.",
      "",
      "EVENTUELT TIDLIGERE TRÆNINGSFORLØB",
      formatHistory(state),
      "",
      "BRUGERENS NYESTE ANMODNING ELLER OPLYSNING",
      message || "Analysér den gemte hændelse.",
      "",
      "TIDLIGERE ANALYSE, HVIS DEN FINDES",
      state.last_analysis || "Ingen tidligere analyse.",
    ].join("\n");
  }

  if (action === "retry_incident_turn") {
    return [
      "PRØV IGEN — SAMME KONKRETE HÆNDELSE",
      `Forsøg nummer: ${state.retry_attempt || 1}`,
      "Brugeren afprøver en ny lærerformulering i præcis det øjeblik, hvor den oprindelige situation eskalerede.",
      "Svar kun som barnet eller eleven. Giv ingen faglig forklaring i selve rolleturen.",
      "",
      "DEN OPRINDELIGE HÆNDELSE",
      state.incident_case || "Ingen hændelse er gemt.",
      "",
      "DEN TIDLIGERE HÆNDELSESANALYSE",
      state.last_analysis || "Ingen tidligere analyse.",
      "",
      "EVENTUEL REVERSE",
      state.last_reverse || "Ingen tidligere reverse.",
      "",
      "DET AKTUELLE PRØV-IGEN-FORLØB",
      formatIncidentRetryHistory(state),
      "",
      "LÆRERENS NYESTE REPLIK — SVAR NU KUN SOM BARNET/ELEVEN",
      message || "Fortsæt naturligt som barnet eller eleven.",
    ].join("\n");
  }

  if (
    action === "feedback" &&
    state.mode === "incident_analysis" &&
    state.retry_history.length > 0
  ) {
    return [
      "FEEDBACK PÅ 'PRØV IGEN'-FORSØG",
      `Brugerens faglige rolle: ${state.user_role || "lærer/pædagog"}`,
      "",
      "DEN OPRINDELIGE HÆNDELSE",
      state.incident_case || "Ingen hændelse er gemt.",
      "",
      "DEN TIDLIGERE HÆNDELSESANALYSE",
      state.last_analysis || "Ingen tidligere analyse.",
      "",
      "EVENTUEL REVERSE",
      state.last_reverse || "Ingen tidligere reverse.",
      "",
      "DET GENNEMFØRTE PRØV-IGEN-FORLØB",
      formatIncidentRetryHistory(state),
      "",
      "BRUGERENS ANMODNING",
      message || "Giv feedback på forsøget.",
    ].join("\n");
  }

  const roleHeader =
    action === "feedback" || action === "hint"
      ? [
          "VEJLEDNINGSROLLE — HØJESTE PRIORITET",
          `BRUGEREN SKAL HAVE HJÆLP SOM: ${state.user_role}`,
          `MODPARTEN I SCENEN ER: ${state.cda_role}`,
          `Du er ude af rollen. Du må ikke svare som ${state.cda_role}, og du må ikke give brugeren råd beregnet til ${state.cda_role}.`,
        ]
      : [
          "ABSOLUT AKTUEL ROLLELÅS — HØJESTE PRIORITET",
          `BRUGEREN TALER NU SOM: ${state.user_role}`,
          `CDA SKAL SVARE UDELUKKENDE SOM: ${state.cda_role}`,
          "Gamle rolleangivelser i scene eller historik er kun historiske og må ikke overstyre denne rolle-lås.",
        ];

  return [
    ...roleHeader,
    "",
    "AKTUEL ROLLESPILSTILSTAND",
    `Session: ${state.session_id}`,
    `Status: ${state.status}`,
    `Træningsform: ${state.training_type || "generelt rollespil"}`,
    `Sværhedsgrad: ${state.difficulty}`,
    "",
    "OPRINDELIG SCENE OG KENDTE FAKTA",
    "Sceneteksten kan indeholde den første rollefordeling. Efter et rolleskift er den kun historisk.",
    state.scene,
    "",
    "HELE DET AKTUELLE FORLØB MED ROLLEGRÆNSER",
    formatHistory(state),
    "",
    action === "feedback"
      ? "BRUGERENS ANMODNING OM FEEDBACK"
      : action === "hint"
        ? "BRUGERENS ANMODNING OM ET HINT"
        : `NYESTE REPLIK FRA BRUGEREN SOM ${state.user_role} — SVAR KUN SOM ${state.cda_role}`,
    message || "Fortsæt naturligt fra det seneste punkt.",
  ].join("\n");
}

async function runModel(openai, state, action, message) {
  if (["start", "new_scene", "turn"].includes(action) && !state.scene) {
    throw new Error("En konkret scene mangler, så rollespillet må ikke starte");
  }

  const response = await openai.responses.create({
    model: MODEL,
    reasoning: {
      effort: "low",
    },
    instructions: buildRoleplayInstructions(state, action),
    input: buildModelInput(state, action, message),
    max_output_tokens:
      action === "reverse_incident"
        ? 1200
        : action === "analyze_incident"
          ? 900
        : action === "retry_incident_turn"
          ? 350
        : action === "feedback"
          ? 700
          : action === "hint"
            ? 180
            : 500,
  });

  if (response.status === "incomplete") {
    const incompleteInputTokens = Number(response?.usage?.input_tokens || 0);
    const incompleteOutputTokens = Number(response?.usage?.output_tokens || 0);
    const incompleteReasoningTokens = Number(
      response?.usage?.output_tokens_details?.reasoning_tokens || 0
    );
    const incompleteTotalTokens = Number(
      response?.usage?.total_tokens ||
      incompleteInputTokens + incompleteOutputTokens
    );
    const incompleteReason =
      cleanText(response?.incomplete_details?.reason, 120) || "ukendt";

    console.error("CDA rollespil ufuldstændigt svar:", {
      phase: action,
      reason: incompleteReason,
      input_tokens: incompleteInputTokens,
      output_tokens: incompleteOutputTokens,
      reasoning_tokens: incompleteReasoningTokens,
      total_tokens: incompleteTotalTokens,
      partial_output_chars: cleanText(response.output_text, 8000).length,
    });

    throw new Error(
      `Ufuldstændigt svar fra rollespilsmotoren (${incompleteReason})`
    );
  }

  const reply = cleanText(response.output_text, 8000);

  if (!reply) {
    throw new Error("Rollespilsmotoren returnerede intet svar");
  }

  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const totalTokens = Number(
    response?.usage?.total_tokens || inputTokens + outputTokens
  );

  console.log("CDA rollespil tokenmåling:", {
    phase: action,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  });

  return {
    reply,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    },
  };
}

function roleplayHelpReply() {
  return [
    "CDA's trænings- og refleksionsmotor er klar.",
    "",
    "Vælg én indgang:",
    "- Kør en hændelse",
    "- Træn en situation",
    "- Øv en samtale",
    "",
    "Skriv fx: ‘Jeg er læreren. Du spiller en skeptisk forælder. Vi skal tale om Peters skolefravær. Mit mål er en fælles plan, og forælderen mener, at skolen er problemet.’",
    "Eller: ‘Analysér denne hændelse: Jeg sagde ..., barnet gjorde ...’",
    "",
    "Kommandoer: Start rollespil, Analysér hændelsen, Reverse situationen, Prøv igen, Pause, Fortsæt, Skift rolle, Ny scene, Hint, Feedback, Stop og Nulstil.",
  ].join("\n");
}

function appendRoleplayTurn(state, userMessage, assistantReply) {
  const combinedHistory = [
    ...state.history,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply },
  ];
  const sanitizedHistory = sanitizeHistory(combinedHistory);
  const removedItems = Math.max(0, combinedHistory.length - sanitizedHistory.length);

  state.history = sanitizedHistory;

  if (removedItems > 0) {
    state.role_events = sanitizeRoleEvents(
      (state.role_events || []).map((event) => ({
        ...event,
        history_index: Math.max(0, event.history_index - removedItems),
      })),
      state.history.length,
      state.user_role,
      state.cda_role
    );
  }
}

function appendRoleplayOpening(state, assistantReply) {
  state.history = sanitizeHistory([
    ...state.history,
    { role: "assistant", content: assistantReply },
  ]);
}

function appendIncidentRetryTurn(state, userMessage, assistantReply) {
  state.retry_history = sanitizeHistory([
    ...state.retry_history,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply },
  ]).slice(-MAX_RETRY_HISTORY_ITEMS);
}

async function runRoleplayChatRequest({ openai, body: requestBody = {} } = {}) {
  try {
    const body = requestBody || {};
    const message = cleanText(body.message);
    let state = sanitizeState(body.state || {});
    const config = getRoleplayConfiguration();
    const language = body.language === "English" ? "English" : state.language;

    if (isScenarioLibraryRequest(message, config)) {
      const library = getRollespil();
      const requestedScenario = findRequestedScenario(message, library.data);

      if (!requestedScenario) {
        state = sanitizeState({
          status: "setup",
          mode: "roleplay",
          language,
        });

        return createRoleplayResult(200, {
          success: true,
          reply: buildScenarioLibraryReply(library.data, language),
          action: "list_scenarios",
          model: null,
          usage: null,
          state,
        });
      }

      state = sanitizeState({
        status: "setup",
        mode: "roleplay",
        entry_mode:
          cleanText(config?.setup_requirements?.default_mode, 40) ||
          "situation",
        language,
        scene: buildScenarioSetupContext(requestedScenario),
      });

      return createRoleplayResult(200, {
        success: true,
        reply: buildScenarioRoleQuestion(requestedScenario, language),
        action: "select_scenario",
        model: null,
        usage: null,
        state,
      });
    }

    if (isRoleplayMenuRequest(message, config)) {
      state = sanitizeState({
        status: "setup",
        mode: "roleplay",
        language,
      });

      return createRoleplayResult(200, {
        success: true,
        reply: roleplayHelpReply(),
        action: "help",
        model: null,
        usage: null,
        state,
      });
    }

    const requestedEntryMode = getRoleplayEntryMode(message, config);
    const configuredEntryAction = cleanText(
      config?.entry_modes?.[requestedEntryMode]?.action,
      40
    );
    let action = detectAction(message, state, body.action, config);

    if (
      action === "start" &&
      ["start", "analyze_incident"].includes(configuredEntryAction)
    ) {
      action = configuredEntryAction;
    }

    if (action === "new_roleplay") {
      state = sanitizeState({
        session_id: createSessionId(),
        status: "setup",
        mode: "roleplay",
        language,
      });

      if (isExactConfiguredControlPhrase(
        message,
        config,
        "new_roleplay"
      )) {
        return createRoleplayResult(200, {
          success: true,
          reply: roleplayHelpReply(),
          action,
          model: null,
          usage: null,
          state,
        });
      }

      action = "start";
    }

    if (action === "reset") {
      return createRoleplayResult(200, {
        success: true,
        reply: "Rollespillet er nulstillet.",
        action,
        model: null,
        usage: null,
        state: sanitizeState({ status: "setup" }),
      });
    }

    if (action === "help") {
      state.status = "setup";

      return createRoleplayResult(200, {
        success: true,
        reply: roleplayHelpReply(),
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "start") {
      const continuingPreparation = state.status === "preparation";
      const priorSetupContext =
        ["setup", "preparation"].includes(state.status) &&
        state.history.length === 0
          ? state.scene
          : "";
      const startsSelectedScenario = priorSetupContext.startsWith(
        "VALGT SCENARIE FRA BIBLIOTEKET"
      );
      const setupContext = cleanText(
        [...new Set([
          cleanText(body.scene, 6000),
          cleanText(priorSetupContext, 6000),
          message,
        ].filter(Boolean))].join("\n\n"),
        6000
      );
      const entryMode =
        (state.preparation_asked ? state.entry_mode : requestedEntryMode) ||
        state.entry_mode ||
        getRoleplayEntryMode(setupContext, config) ||
        cleanText(config?.setup_requirements?.default_mode, 40) ||
        "situation";
      const { definition: setupDefinition } = getRoleplaySetupDefinition(
        config,
        entryMode
      );

      if (
        !state.preparation_asked &&
        isExactRoleplayEntryPhrase(message, entryMode, config) &&
        !shouldSkipRoleplayPreparation(message, config)
      ) {
        state = sanitizeState({
          session_id: state.session_id || createSessionId(),
          status: "preparation",
          mode: "roleplay",
          entry_mode: entryMode,
          language,
          preparation_asked: true,
          user_role: cleanText(body.user_role || body.role, 160),
          cda_role: cleanText(body.cda_role, 160),
          difficulty: inferDifficulty(message, body.difficulty, "mellem"),
          scene: setupContext,
        });

        return createRoleplayResult(200, {
          success: true,
          reply: buildMissingSetupQuestion(
            config,
            entryMode,
            setupDefinition.required_fields,
            language
          ),
          action: `prepare_${entryMode}`,
          model: null,
          usage: null,
          state,
        });
      }

      let startUserRole =
        cleanText(body.user_role || state.user_role || body.role, 160) ||
        extractRole(setupContext, "user");
      let startCdaRole =
        cleanText(body.cda_role || state.cda_role, 160) ||
        extractRole(setupContext, "cda");
      const setupAssessment = await assessRoleplaySetup({
        openai,
        config,
        entryMode,
        context: setupContext,
        userRole: startUserRole,
        cdaRole: startCdaRole,
      });
      startUserRole = setupAssessment.userRole;
      startCdaRole = setupAssessment.cdaRole;

      console.log("CDA rollespil opsætningskontrol:", {
        entry_mode: setupAssessment.selectedMode,
        user_role: startUserRole,
        cda_role: startCdaRole,
        missing_fields: setupAssessment.missingFields,
      });

      state = sanitizeState({
        session_id: state.session_id || createSessionId(),
        status: "setup",
        mode: "roleplay",
        previous_mode: "",
        user_role: startUserRole,
        cda_role: startCdaRole,
        entry_mode: entryMode,
        language,
        preparation_asked:
          continuingPreparation || state.preparation_asked,
        preparation_answer:
          continuingPreparation ? message : state.preparation_answer,
        training_type: cleanText(body.training_type, 180),
        difficulty: inferDifficulty(
          message,
          body.difficulty,
          state.difficulty || "mellem"
        ),
        scene: startsSelectedScenario ? priorSetupContext : setupContext,
        incident_case: "",
        history: [],
        role_events: [],
        last_analysis: "",
        last_reverse: "",
      });

      if (setupAssessment.missingFields.length > 0) {
        return createRoleplayResult(200, {
          success: true,
          reply: buildMissingSetupQuestion(
            config,
            entryMode,
            setupAssessment.missingFields,
            language
          ),
          action,
          model: null,
          usage: null,
          state,
        });
      }

      state.role_events = [
        {
          history_index: 0,
          user_role: state.user_role,
          cda_role: state.cda_role,
        },
      ];

      state.training_type =
        state.training_type ||
        inferTrainingType(message, state.user_role, state.cda_role);
      state.status = "active";

      const modelAction = startsSelectedScenario
        ? "scenario_opening"
        : action;
      const result = await runModel(
        openai,
        state,
        modelAction,
        startsSelectedScenario ? "" : message
      );

      if (startsSelectedScenario) {
        appendRoleplayOpening(state, result.reply);
      } else {
        appendRoleplayTurn(state, message, result.reply);
      }

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "pause") {
      if (!["active", "feedback"].includes(state.status)) {
        return createRoleplayResult(409, {
          success: false,
          error: "Der er ikke et aktivt rollespil at sætte på pause",
          state,
        });
      }

      state.status = "paused";
      return createRoleplayResult(200, {
        success: true,
        reply: "Rollespillet er sat på pause.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "continue") {
      if (state.mode === "incident_analysis" && state.previous_mode === "roleplay") {
        state.mode = "roleplay";
        state.previous_mode = "";
        state.status = "active";

        return createRoleplayResult(200, {
          success: true,
          reply: `Rollespillet fortsætter. Du er ${state.user_role}, og jeg er ${state.cda_role}. Din tur.`,
          action,
          model: null,
          usage: null,
          state,
        });
      }

      if (!["paused", "feedback"].includes(state.status)) {
        return createRoleplayResult(409, {
          success: false,
          error: state.mode === "incident_analysis"
            ? "Hændelsesanalysen er allerede aktiv"
            : "Der er ikke et pauset rollespil at fortsætte",
          state,
        });
      }

      state.status = "active";
      const reply = state.mode === "incident_analysis"
        ? "Hændelsesanalysen fortsætter. Tilføj den næste oplysning eller spørg ind til analysen."
        : `Rollespillet fortsætter. Du er ${state.user_role}, og jeg er ${state.cda_role}. Din tur.`;

      return createRoleplayResult(200, {
        success: true,
        reply,
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "switch_role") {
      if (!state.user_role || !state.cda_role) {
        return createRoleplayResult(409, {
          success: false,
          error: "Rollerne er ikke fastlagt endnu",
          state,
        });
      }

      const requestedUserRole =
        cleanText(body.user_role, 160) || extractRole(message, "user");
      const requestedCdaRole =
        cleanText(body.cda_role, 160) || extractRole(message, "cda");

      if (requestedUserRole || requestedCdaRole) {
        state.user_role = requestedUserRole || state.user_role;
        state.cda_role = requestedCdaRole || state.cda_role;
      } else {
        const previousUserRole = state.user_role;
        state.user_role = state.cda_role;
        state.cda_role = previousUserRole;
      }

      state.role_events = sanitizeRoleEvents(
        [
          ...(state.role_events || []),
          {
            history_index: state.history.length,
            user_role: state.user_role,
            cda_role: state.cda_role,
          },
        ],
        state.history.length,
        state.user_role,
        state.cda_role
      );

      state.status = "active";
      return createRoleplayResult(200, {
        success: true,
        reply: `Rollerne er skiftet. Du er nu ${state.user_role}, og jeg spiller ${state.cda_role}.`,
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "new_scene") {
      const bareNewScene =
        isExactConfiguredControlPhrase(message, config, "new_scene") &&
        !cleanText(body.scene, 6000) &&
        !cleanText(body.user_role, 160) &&
        !cleanText(body.cda_role, 160);

      if (bareNewScene) {
        const newEntryMode =
          cleanText(config?.setup_requirements?.default_mode, 40) ||
          "situation";
        const { definition } = getRoleplaySetupDefinition(
          config,
          newEntryMode
        );
        state = sanitizeState({
          session_id: state.session_id || createSessionId(),
          status: "setup",
          mode: "roleplay",
          entry_mode: newEntryMode,
          language,
          difficulty: state.difficulty,
        });

        return createRoleplayResult(200, {
          success: true,
          reply: buildMissingSetupQuestion(
            config,
            newEntryMode,
            definition.required_fields,
            language
          ),
          action,
          model: null,
          usage: null,
          state,
        });
      }

      let newUserRole =
        cleanText(body.user_role, 160) || extractRole(message, "user");
      let newCdaRole =
        cleanText(body.cda_role, 160) || extractRole(message, "cda");
      const newScene = cleanText(body.scene, 6000) || message;
      const newEntryMode =
        getRoleplayEntryMode(newScene, config) ||
        cleanText(config?.setup_requirements?.default_mode, 40) ||
        "situation";
      const setupAssessment = await assessRoleplaySetup({
        openai,
        config,
        entryMode: newEntryMode,
        context: newScene,
        userRole: newUserRole,
        cdaRole: newCdaRole,
      });
      newUserRole = setupAssessment.userRole;
      newCdaRole = setupAssessment.cdaRole;

      state = sanitizeState({
        session_id: state.session_id || createSessionId(),
        status: "setup",
        mode: "roleplay",
        previous_mode: "",
        user_role: newUserRole,
        cda_role: newCdaRole,
        entry_mode: newEntryMode,
        training_type:
          cleanText(body.training_type, 180) ||
          inferTrainingType(message, newUserRole, newCdaRole),
        difficulty: inferDifficulty(
          message,
          body.difficulty,
          state.difficulty || "mellem"
        ),
        scene: newScene,
        incident_case: "",
        history: [],
        role_events: [],
        last_feedback: "",
        last_analysis: "",
        last_reverse: "",
      });

      if (setupAssessment.missingFields.length > 0) {
        return createRoleplayResult(200, {
          success: true,
          reply: buildMissingSetupQuestion(
            config,
            newEntryMode,
            setupAssessment.missingFields,
            language
          ),
          action,
          model: null,
          usage: null,
          state,
        });
      }

      state.role_events = [
        {
          history_index: 0,
          user_role: state.user_role,
          cda_role: state.cda_role,
        },
      ];
      state.status = "active";

      const result = await runModel(openai, state, action, message);
      appendRoleplayTurn(state, message, result.reply);

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "stop") {
      state.status = "ended";
      return createRoleplayResult(200, {
        success: true,
        reply: "Rollespillet er afsluttet.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "analyze_incident") {
      const wasRoleplay =
        state.mode === "roleplay" &&
        state.history.length > 0 &&
        Boolean(state.user_role && state.cda_role);

      state.retry_phase = "";
      state.retry_history = [];
      state.last_retry_feedback = "";

      const explicitIncident = cleanText(body.incident_case, MAX_INCIDENT_CHARS);
      if (explicitIncident) {
        state.incident_case = explicitIncident;
      } else {
        const incidentMessage = isExactRoleplayEntryPhrase(
          message,
          "incident",
          config
        )
          ? ""
          : message;
        state.incident_case = mergeIncidentCase(
          state.incident_case,
          incidentMessage
        );
      }

      if (!state.incident_case && state.history.length === 0) {
        state.mode = "incident_analysis";
        state.status = "active";
        state.user_role =
          cleanText(body.user_role, 160) || state.user_role || "lærer/pædagog";
        state.cda_role = state.cda_role || "CDA træner";

        return createRoleplayResult(200, {
          success: true,
          reply: [
            "Beskriv den konkrete hændelse med dine egne ord.",
            "",
            "Skriv gerne: hvad der skete lige før, hvad du sagde eller gjorde, hvordan barnet reagerede, og hvad der skete bagefter.",
          ].join("\n"),
          action,
          model: null,
          usage: null,
          state,
        });
      }

      if (wasRoleplay) {
        state.previous_mode = "roleplay";
      }

      state.mode = "incident_analysis";
      state.status = "active";
      state.training_type = state.training_type || "hændelsesanalyse";
      state.user_role =
        cleanText(body.user_role, 160) || state.user_role || "lærer/pædagog";
      state.cda_role = state.cda_role || "CDA træner";

      if (!state.role_events.length) {
        state.role_events = [
          {
            history_index: 0,
            user_role: state.user_role,
            cda_role: state.cda_role,
          },
        ];
      }

      const result = await runModel(openai, state, action, message);
      state.last_analysis = result.reply;

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "reverse_incident") {
      if (!state.incident_case && state.history.length === 0) {
        return createRoleplayResult(409, {
          success: false,
          error: "Der er ingen konkret hændelse at reverse endnu. Beskriv eller analysér hændelsen først.",
          state,
        });
      }

      const explicitIncident = cleanText(body.incident_case, MAX_INCIDENT_CHARS);
      if (explicitIncident) {
        state.incident_case = explicitIncident;
      }

      const reverseFromLiveRoleplay =
        state.mode === "roleplay" && state.history.length > 0;

      if (reverseFromLiveRoleplay && !state.incident_case) {
        state.incident_case = cleanText(
          [
            "OPRINDELIG SCENE OG KENDTE FAKTA",
            state.scene,
            "",
            "GENNEMFØRT ROLLESPILSFORLØB",
            formatHistory(state),
          ].join("\n"),
          MAX_INCIDENT_CHARS
        );
      }

      if (reverseFromLiveRoleplay) {
        state.previous_mode = "roleplay";
      }

      state.mode = "incident_analysis";
      state.status = "active";
      state.training_type = state.training_type || "hændelsesanalyse";
      state.user_role = cleanText(body.user_role, 160) || state.user_role || "lærer/pædagog";
      state.cda_role = state.cda_role || "CDA træner";

      const result = await runModel(openai, state, action, message);
      state.last_reverse = result.reply;

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "retry_required") {
      return createRoleplayResult(200, {
        success: true,
        reply: "Skriv ‘Prøv igen’, hvis du vil afprøve en ny formulering i den samme hændelse.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "retry_incident") {
      const hasAnalyzedIncident =
        Boolean(state.incident_case) &&
        Boolean(state.last_analysis || state.last_reverse);

      if (!hasAnalyzedIncident) {
        return createRoleplayResult(200, {
          success: true,
          reply: "Der er ingen analyseret hændelse at prøve igen. Analysér først en konkret hændelse.",
          action,
          model: null,
          usage: null,
          state,
        });
      }

      state.mode = "incident_analysis";
      state.status = "active";
      state.training_type = state.training_type || "hændelsesanalyse";
      state.user_role = state.user_role || "lærer/pædagog";
      state.cda_role = state.cda_role || "CDA træner";
      state.retry_phase = "awaiting_teacher_rephrase";
      state.retry_history = [];
      state.retry_attempt += 1;

      return createRoleplayResult(200, {
        success: true,
        reply: "Skriv den nye formulering, du vil prøve over for barnet.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "retry_incident_turn") {
      if (!state.incident_case || !(state.last_analysis || state.last_reverse)) {
        return createRoleplayResult(409, {
          success: false,
          error: "Den analyserede hændelse mangler. Analysér hændelsen igen, før du bruger ‘Prøv igen’.",
          state,
        });
      }

      if (
        !["awaiting_teacher_rephrase", "active"].includes(
          state.retry_phase
        )
      ) {
        return createRoleplayResult(409, {
          success: false,
          error: "Skriv ‘Prøv igen’, før du afprøver en ny formulering.",
          state,
        });
      }

      if (!message) {
        return createRoleplayResult(400, {
          success: false,
          error: "Den nye formulering er tom",
          state,
        });
      }

      state.status = "active";
      const result = await runModel(openai, state, action, message);
      appendIncidentRetryTurn(state, message, result.reply);
      state.retry_phase = "active";

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "feedback" || action === "hint") {
      const hasIncidentRetry =
        state.mode === "incident_analysis" &&
        state.retry_history.some((item) => item.role === "user") &&
        state.retry_history.some((item) => item.role === "assistant");

      if (
        action === "feedback" &&
        state.retry_phase === "awaiting_teacher_rephrase"
      ) {
        return createRoleplayResult(200, {
          success: true,
          reply: "Skriv først den nye formulering, så reagerer barnet. Derefter kan du bede om feedback.",
          action,
          model: null,
          usage: null,
          state,
        });
      }

      if (action === "feedback" && hasIncidentRetry) {
        const result = await runModel(openai, state, action, message);
        state.status = "feedback";
        state.last_feedback = result.reply;
        state.last_retry_feedback = result.reply;
        state.retry_phase = "feedback_complete";

        return createRoleplayResult(200, {
          success: true,
          reply: result.reply,
          action,
          model: MODEL,
          usage: result.usage,
          state,
        });
      }

      if (!state.user_role || !state.cda_role || state.history.length === 0) {
        return createRoleplayResult(409, {
          success: false,
          error: "Der er ikke et gennemført rollespilsforløb at vurdere",
          state,
        });
      }

      const result = await runModel(openai, state, action, message);

      if (action === "feedback") {
        state.status = "feedback";
        state.last_feedback = result.reply;
      }

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    if (action === "turn") {
      if (state.status === "paused") {
        return createRoleplayResult(409, {
          success: false,
          error: "Rollespillet er på pause. Skriv ‘Fortsæt’ først.",
          state,
        });
      }

      if (state.status !== "active") {
        return createRoleplayResult(409, {
          success: false,
          error: "Rollespillet er ikke aktivt. Start rollespillet først.",
          state,
        });
      }

      if (!message) {
        return createRoleplayResult(400, {
          success: false,
          error: "Beskeden er tom",
          state,
        });
      }

      const result = await runModel(openai, state, action, message);
      appendRoleplayTurn(state, message, result.reply);

      return createRoleplayResult(200, {
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    return createRoleplayResult(400, {
      success: false,
      error: `Ukendt rollespilshandling: ${action}`,
      state,
    });
  } catch (error) {
    console.error("CDA rollespil-chatfejl:", error);

    return createRoleplayResult(500, {
      success: false,
      error: "Rollespilsmotoren kunne ikke behandle beskeden",
      details: error.message,
    });
  }
}
function encodeCdaRoleplayState(state, config = getRoleplayConfiguration()) {
  const prefix = config?.state?.encoded_prefix || "roleplay_chat_v1:";
  return `${prefix}${Buffer.from(JSON.stringify(state || {}), "utf8").toString("base64url")}`;
}

function decodeCdaRoleplayState(value, config = getRoleplayConfiguration()) {
  const text = String(value || "");
  const prefix = config?.state?.encoded_prefix || "roleplay_chat_v1:";

  if (text.startsWith(prefix)) {
    try {
      return JSON.parse(
        Buffer.from(text.slice(prefix.length), "base64url").toString("utf8")
      );
    } catch {
      return null;
    }
  }

  if (text.startsWith("roleplay_v2:")) {
    try {
      const legacy = JSON.parse(
        Buffer.from(text.slice("roleplay_v2:".length), "base64url").toString("utf8")
      );
      return sanitizeState({
        status: "setup",
        mode: "roleplay",
        scene: legacy?.initialMessage || "",
        history: [],
      });
    } catch {
      return null;
    }
  }

  if (text === "roleplay_active" || text === "roleplay_conversation_preparation") {
    return sanitizeState({ status: "setup", mode: "roleplay" });
  }

  return null;
}

async function runRoleplayFlow({
  openai,
  message = "",
  pendingAction = null,
  role = "",
  language = "Dansk",
} = {}) {
  const config = getRoleplayConfiguration();
  const state = decodeCdaRoleplayState(pendingAction, config);
  const configuredControlAction = detectConfiguredControlAction(
    message,
    config
  );

  if (!state && !isRoleplayTriggerMessage(message, config)) {
    return null;
  }

  const result = await runRoleplayChatRequest({
    openai,
    body: {
      message,
      state: state || undefined,
      action: state || configuredControlAction ? undefined : "start",
      role,
      language,
    },
  });
  const responseBody = result.body || {};
  const usage = responseBody.usage
    ? [{
        call: 1,
        phase: `roleplay_${responseBody.action || "request"}`,
        tools_returned_to_model: [],
        input_tokens: Number(responseBody.usage.input_tokens || 0),
        output_tokens: Number(responseBody.usage.output_tokens || 0),
        total_tokens: Number(responseBody.usage.total_tokens || 0),
      }]
    : [];
  const ended = responseBody.state?.status === "ended";

  return {
    reply: responseBody.reply || responseBody.error || "Rollespilsmotoren kunne ikke svare.",
    pendingAction:
      responseBody.state && !ended
        ? encodeCdaRoleplayState(responseBody.state, config)
        : null,
    model: responseBody.model || "local",
    usage,
    usedTools: ["roleplayEngineV3"],
    toolDebug: [{
      name: "roleplayEngineV3",
      action: responseBody.action || "error",
      status_code: result.statusCode,
      state_status: responseBody.state?.status || null,
      mode: responseBody.state?.mode || null,
    }],
    usedDataSources: [ROLEPLAY_CONFIG_FILE],
    conversationMode: "roleplay",
  };
}

export {
  decodeCdaRoleplayState,
  encodeCdaRoleplayState,
  getRoleplayConfiguration,
  getRoleplayEntryMode,
  getRollespil,
  isRoleplayTriggerMessage,
  runRoleplayChatRequest,
  runRoleplayFlow,
};
