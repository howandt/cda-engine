import fs from "fs";
import path from "path";

const ROLEPLAY_CONFIG_FILE = "data/CDA_RoleplayEngine.json";
const ROLEPLAY_SCENARIOS_FILE = "data/rollespil_scenarier.json";
const PROMPT_RULES_FILE = "data/prompt_rules.json";

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

function normalizeRoleplayPhrase(value) {
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

function includesConfiguredPhrase(text, phrases) {
  return (Array.isArray(phrases) ? phrases : []).some((phrase) =>
    text.includes(normalizeRoleplayPhrase(phrase))
  );
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

function getRoleplayEntryMode(message, config = getRoleplayConfiguration()) {
  const text = normalizeRoleplayPhrase(message);

  for (const [mode, definition] of Object.entries(config.entry_modes || {})) {
    if (includesConfiguredPhrase(text, definition?.phrases)) {
      return mode;
    }
  }

  return null;
}

function isRoleplayExitMessage(message, config = getRoleplayConfiguration()) {
  const text = normalizeRoleplayPhrase(message);
  return includesConfiguredPhrase(text, config?.state?.exit_phrases);
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

  const hasPracticeVerb = includesConfiguredPhrase(
    text,
    activation.practice_verbs
  );
  const hasPracticeObject = includesConfiguredPhrase(
    text,
    activation.practice_objects
  );

  return hasPracticeVerb && hasPracticeObject;
}

function isConversationPreparationPending(pendingActionValue, config) {
  return decodeRoleplayState(pendingActionValue, config)?.stage === "preparation";
}

function shouldSkipConversationPreparation(message, config) {
  const text = normalizeRoleplayPhrase(message);
  return includesConfiguredPhrase(
    text,
    config?.state?.skip_preparation_phrases
  );
}

function isScenarioLibraryRequest(message, config) {
  const text = normalizeRoleplayPhrase(message);
  return includesConfiguredPhrase(
    text,
    config?.scenario_library?.explicit_request_phrases
  );
}

function encodeRoleplayState(state, config = getRoleplayConfiguration()) {
  const prefix = config?.state?.encoded_prefix || "roleplay_v2:";
  const payload = Buffer.from(
    JSON.stringify({
      version: 2,
      stage: state?.stage || "active",
      entryMode: state?.entryMode || null,
      initialMessage: String(state?.initialMessage || "").slice(0, 1800),
      turns: Array.isArray(state?.turns) ? state.turns : [],
    }),
    "utf8"
  ).toString("base64url");

  return `${prefix}${payload}`;
}

function decodeRoleplayState(
  pendingActionValue,
  config = getRoleplayConfiguration()
) {
  const value = String(pendingActionValue || "");
  const prefix = config?.state?.encoded_prefix || "roleplay_v2:";

  if (value.startsWith(prefix)) {
    try {
      const decoded = JSON.parse(
        Buffer.from(value.slice(prefix.length), "base64url").toString("utf8")
      );
      return decoded?.version === 2 ? decoded : null;
    } catch {
      return null;
    }
  }

  if (value === config?.state?.preparation_pending_action) {
    return { version: 2, stage: "preparation", entryMode: "conversation", turns: [] };
  }

  if (value === config?.pending_action) {
    return { version: 2, stage: "active", entryMode: null, turns: [] };
  }

  return null;
}

function isRoleplayContextActive(
  message,
  pendingActionValue,
  config = getRoleplayConfiguration()
) {
  return (
    isRoleplayTriggerMessage(message, config) ||
    Boolean(decodeRoleplayState(pendingActionValue, config))
  );
}

function getRoleplayRules() {
  const rulesData = readJsonFile(
    path.join(process.cwd(), "data", "prompt_rules.json"),
    `${PROMPT_RULES_FILE} blev ikke fundet`
  );
  const systemRules = rulesData?.system_rules || {};

  return {
    roleplay_rules: systemRules.roleplay_rules || {},
    roleplay_learning_rules: systemRules.roleplay_learning_rules || {},
    roleplay_emotion_rules: systemRules.roleplay_emotion_rules || {},
    conflict_mediator_rules: systemRules.conflict_mediator_rules || {},
    school_home_dialogue_rules: systemRules.school_home_dialogue_rules || {},
  };
}

function buildRoleplayRuleInjection({
  message = "",
  pendingAction = null,
  entryMode: suppliedEntryMode = null,
  language = "Dansk",
  config = getRoleplayConfiguration(),
} = {}) {
  const rules = getRoleplayRules();
  const entryMode = suppliedEntryMode || getRoleplayEntryMode(message, config);
  const entryDefinition = entryMode
    ? config?.entry_modes?.[entryMode]
    : null;
  const marker = config?.state?.marker ||
    "[[PENDING_ACTION:ROLEPLAY_ACTIVE]]";
  const structuredHeadings =
    config?.output_contract?.structured_headings?.[language] || [];

  return [
    "",
    "════════════════════════════════════════",
    "VIGTIGT — ROLLESPIL/TRÆNING ER AKTIVT I DENNE SAMTALE.",
    "Dette svar er IKKE normal rådgivning, selvom resten af denne prompt beskriver den normale CDA-stil.",
    "DU MÅ ALDRIG bruge overskrifterne 'Det peger mest på', 'Det vigtigste her er' eller 'Det kan du gøre nu' i dette svar.",
    "Brug kun rollespillets struktur og læringsregler herunder.",
    "════════════════════════════════════════",
    "",
    `AKTUEL ROLLESPILSINDGANG: ${entryDefinition?.label || entryMode || "igangværende rollespil"}`,
    `ALLEREDE AKTIVT ROLLESPIL: ${pendingAction === config.pending_action ? "ja" : "nej"}`,
    `FORBEREDELSESSPØRGSMÅL ER ALLEREDE STILLET: ${isConversationPreparationPending(pendingAction, config) ? "ja" : "nej"}`,
    "",
    "roleplay_rules:",
    JSON.stringify(rules.roleplay_rules, null, 2),
    "",
    "roleplay_learning_rules:",
    JSON.stringify(rules.roleplay_learning_rules, null, 2),
    "",
    "roleplay_emotion_rules:",
    JSON.stringify(rules.roleplay_emotion_rules, null, 2),
    "Når reglerne siger analyzeEmotion, er det tilgængelige CDA-værktøj getEmotionAnalysis.",
    "",
    "conflict_mediator_rules:",
    JSON.stringify(rules.conflict_mediator_rules, null, 2),
    "",
    "school_home_dialogue_rules:",
    JSON.stringify(rules.school_home_dialogue_rules, null, 2),
    "",
    "output_contract:",
    JSON.stringify(config.output_contract || {}, null, 2),
    "Hvis forberedelsesspørgsmålene allerede er stillet, må du ikke stille dem igen. Start øvelsen ud fra brugerens svar, også når svaret er kort eller ufuldstændigt.",
    `Ved struktureret visning skal overskrifterne være præcis: ${structuredHeadings.map((heading, index) => `'## ${index + 1}. ${heading}'`).join(", ")}.`,
    "Under levende rollespil svarer du som modparten og venter på brugerens næste replik i stedet for at skrive hele samtalen på forhånd.",
    "",
    `Marker-regel: Afslut alle svar i det aktive spor med ${marker} som allersidste tegn. Markøren vises ikke til brugeren. Udelad kun markøren, når rollespillet reelt afsluttes, eller brugeren tydeligt skifter emne.`,
    "Opfind aldrig egne kommandoer, motornavne eller statusbeskeder.",
  ].join("\n");
}

function applyRoleplayHeadingContract(replyText, config) {
  const configuredHeadings = config?.output_contract?.structured_headings;
  const headingSets = Array.isArray(configuredHeadings)
    ? [configuredHeadings]
    : Object.values(configuredHeadings || {}).filter(Array.isArray);

  if (headingSets.length === 0) {
    return String(replyText || "").trim();
  }

  return String(replyText || "")
    .split("\n")
    .map((line) => {
      const candidate = line
        .trim()
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/\*\*/g, "")
        .trim();
      const candidateKey = normalizeRoleplayPhrase(candidate);
      let matchedHeading = null;
      let matchedIndex = -1;

      for (const headings of headingSets) {
        const index = headings.findIndex(
          (heading) => normalizeRoleplayPhrase(heading) === candidateKey
        );
        if (index >= 0) {
          matchedHeading = headings[index];
          matchedIndex = index;
          break;
        }
      }

      return matchedIndex >= 0
        ? `## ${matchedIndex + 1}. ${matchedHeading}`
        : line;
    })
    .join("\n")
    .trim();
}

function parseRoleplayOutput(
  outputText,
  message = "",
  config = getRoleplayConfiguration()
) {
  const marker = config?.state?.marker ||
    "[[PENDING_ACTION:ROLEPLAY_ACTIVE]]";
  const text = String(outputText || "");
  const hasMarker = text.includes(marker);
  const reply = applyRoleplayHeadingContract(
    text.split(marker).join(""),
    config
  );

  return {
    reply,
    pendingAction:
      hasMarker && !isRoleplayExitMessage(message, config)
        ? config.pending_action
        : null,
  };
}

function getResponseUsage(response, call, phase, toolNames = []) {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const totalTokens = Number(
    response?.usage?.total_tokens || inputTokens + outputTokens
  );

  return {
    call,
    phase,
    tools_returned_to_model: toolNames,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}

function getRoleplayLanguage(audienceInstructions) {
  return /AKTUELT SPROG:\s*English/i.test(String(audienceInstructions || ""))
    ? "English"
    : "Dansk";
}

function buildConversationPreparationResult({
  message,
  audienceInstructions,
  config,
}) {
  const language = getRoleplayLanguage(audienceInstructions);
  const questions = config?.state?.preparation_questions?.[language] || [];
  const pendingAction = encodeRoleplayState(
    {
      stage: "preparation",
      entryMode: "conversation",
      initialMessage: message,
      turns: [],
    },
    config
  );

  return {
    reply: questions.join("\n\n"),
    pendingAction,
    model: "local",
    response: null,
    usage: [],
    usedTools: ["roleplayEngineV2"],
    toolDebug: [{
      name: "roleplayEngineV2",
      action: "ask_conversation_preparation_once",
      entry_mode: "conversation",
      language,
    }],
    usedDataSources: [ROLEPLAY_CONFIG_FILE],
    conversationMode: "roleplay",
    debug: {
      entry_mode: "conversation",
      stage: "preparation",
      continued_from_pending: false,
      explicit_exit: false,
    },
  };
}

function buildStatefulRoleplayInput({
  contextualInput,
  message,
  state,
}) {
  if (!state) {
    return contextualInput || message;
  }

  const previousTurns = (Array.isArray(state.turns) ? state.turns : [])
    .map((turn, index) => [
      `TUR ${index + 1} – BRUGER:`,
      turn.user,
      `TUR ${index + 1} – CDA/MODPART:`,
      turn.assistant,
    ].join("\n"))
    .join("\n\n");

  return [
    "AKTIV ROLLESPILSKONTEKST:",
    `Indgang: ${state.entryMode || "ikke angivet"}`,
    "Oprindelig anmodning:",
    state.initialMessage || "Ikke bevaret fra ældre version.",
    previousTurns ? `\nTidligere ture:\n${previousTurns}` : "",
    "",
    "AKTUEL BRUGERREPLIK:",
    message,
    "",
    "ØVRIG AKTIV SAGSKONTEKST:",
    contextualInput || "",
  ].filter(Boolean).join("\n");
}

function appendRoleplayTurn(state, message, reply, config) {
  const maxTurns = Number(config?.state?.max_saved_turns || 6);
  const turns = [
    ...(Array.isArray(state?.turns) ? state.turns : []),
    {
      user: String(message || "").slice(0, 1200),
      assistant: String(reply || "").slice(0, 1800),
    },
  ].slice(-maxTurns);

  return {
    version: 2,
    stage: "active",
    entryMode: state?.entryMode || null,
    initialMessage: state?.initialMessage || message,
    turns,
  };
}

function sanitizeScenarioToolResult(result, config) {
  const excludedFields = new Set(
    Array.isArray(config?.scenario_library?.excluded_ai_fields)
      ? config.scenario_library.excluded_ai_fields
      : []
  );

  function sanitize(value) {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !excludedFields.has(key))
        .map(([key, nestedValue]) => [key, sanitize(nestedValue)])
    );
  }

  return sanitize(result);
}

async function runRoleplayFlow({
  openai,
  model,
  heidiPrompt = "",
  audienceInstructions = "",
  activeCaseInstructions = "",
  contextualInput,
  message = "",
  pendingAction = null,
  responseStyle = "Kort",
  tools = [],
  executeTool,
} = {}) {
  const config = getRoleplayConfiguration();
  const roleplayState = decodeRoleplayState(pendingAction, config);
  const requestedEntryMode = getRoleplayEntryMode(message, config);
  const entryMode = roleplayState?.entryMode || requestedEntryMode;

  if (!isRoleplayContextActive(message, pendingAction, config)) {
    return null;
  }

  if (
    !roleplayState &&
    entryMode === "conversation" &&
    !shouldSkipConversationPreparation(message, config)
  ) {
    return buildConversationPreparationResult({
      message,
      audienceInstructions,
      config,
    });
  }

  if (!openai?.responses?.create) {
    throw new Error("OpenAI-klient mangler i roleplayEngine");
  }

  const runtime = config.runtime || {};
  const selectedModel = model || runtime.model || "gpt-5.4-mini";
  const allowedToolNames = new Set(
    Array.isArray(runtime.allowed_tools) ? runtime.allowed_tools : []
  );
  const scenarioRequestText = [
    roleplayState?.initialMessage,
    message,
  ].filter(Boolean).join(" ");
  const allowScenarioLibrary = isScenarioLibraryRequest(
    scenarioRequestText,
    config
  );
  const roleplayTools = (Array.isArray(tools) ? tools : []).filter(
    (tool) =>
      allowedToolNames.has(tool?.name) &&
      (tool?.name !== "getRollespil" || allowScenarioLibrary)
  );
  const roleplayInstructions = [
    heidiPrompt,
    buildRoleplayRuleInjection({
      message,
      pendingAction,
      entryMode,
      language: getRoleplayLanguage(audienceInstructions),
      config,
    }),
    "",
    audienceInstructions,
    "",
    activeCaseInstructions,
    "",
    `AKTUEL SVARSTIL: ${responseStyle}`,
  ].filter(Boolean).join("\n");

  let response = await openai.responses.create({
    model: selectedModel,
    reasoning: {
      effort: runtime.reasoning_effort || "low",
    },
    instructions: roleplayInstructions,
    input: buildStatefulRoleplayInput({
      contextualInput,
      message,
      state: roleplayState,
    }),
    tools: roleplayTools,
    max_output_tokens: Number(runtime.max_output_tokens || 1200),
  });

  const usage = [
    getResponseUsage(response, 1, "roleplay_initial"),
  ];
  const usedTools = [];
  const toolDebug = [];
  const maxToolRounds = Number(runtime.max_tool_rounds || 3);

  for (let round = 0; round < maxToolRounds; round += 1) {
    const toolCalls = Array.isArray(response?.output)
      ? response.output.filter((item) => item.type === "function_call")
      : [];

    if (toolCalls.length === 0) {
      break;
    }

    if (typeof executeTool !== "function") {
      throw new Error("Værktøjsudfører mangler i roleplayEngine");
    }

    const toolOutputs = toolCalls.map((toolCall) => {
      let parsedArguments = {};
      try {
        parsedArguments = JSON.parse(toolCall.arguments || "{}");
      } catch {
        parsedArguments = {};
      }

      usedTools.push(toolCall.name);
      toolDebug.push({
        name: toolCall.name,
        arguments: parsedArguments,
      });

      const rawToolResult = executeTool(toolCall);
      const toolResult = toolCall.name === "getRollespil"
        ? sanitizeScenarioToolResult(rawToolResult, config)
        : rawToolResult;

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(toolResult),
      };
    });

    response = await openai.responses.create({
      model: selectedModel,
      reasoning: {
        effort: runtime.reasoning_effort || "low",
      },
      instructions: roleplayInstructions,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: roleplayTools,
      max_output_tokens: Number(runtime.max_output_tokens || 1200),
    });

    usage.push(
      getResponseUsage(
        response,
        round + 2,
        "roleplay_after_tool_output",
        toolCalls.map((toolCall) => toolCall.name)
      )
    );
  }

  if (response?.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra roleplayEngine");
  }

  const parsedOutput = parseRoleplayOutput(
    response?.output_text,
    message,
    config
  );
  const explicitExit = isRoleplayExitMessage(message, config);
  const nextState = appendRoleplayTurn(
    roleplayState || {
      entryMode,
      initialMessage: message,
      turns: [],
    },
    message,
    parsedOutput.reply,
    config
  );
  const nextPendingAction = explicitExit
    ? null
    : encodeRoleplayState(nextState, config);

  return {
    reply: parsedOutput.reply,
    pendingAction: nextPendingAction,
    model: selectedModel,
    response,
    usage,
    usedTools,
    toolDebug,
    usedDataSources: [
      ROLEPLAY_CONFIG_FILE,
      PROMPT_RULES_FILE,
      ...(usedTools.includes("getRollespil")
        ? [ROLEPLAY_SCENARIOS_FILE]
        : []),
    ],
    conversationMode: "roleplay",
    debug: {
      entry_mode: entryMode,
      stage: nextState.stage,
      continued_from_pending: Boolean(roleplayState),
      explicit_exit: explicitExit,
      scenario_library_enabled: allowScenarioLibrary,
    },
  };
}

export {
  buildRoleplayRuleInjection,
  decodeRoleplayState,
  encodeRoleplayState,
  getRoleplayConfiguration,
  getRoleplayEntryMode,
  getRollespil,
  isRoleplayContextActive,
  isRoleplayExitMessage,
  isRoleplayTriggerMessage,
  parseRoleplayOutput,
  runRoleplayFlow,
};
