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

  if (includesConfiguredPhrase(text, activation.direct_phrases)) {
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

function isRoleplayContextActive(
  message,
  pendingActionValue,
  config = getRoleplayConfiguration()
) {
  return (
    isRoleplayTriggerMessage(message, config) ||
    pendingActionValue === config.pending_action
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
  config = getRoleplayConfiguration(),
} = {}) {
  const rules = getRoleplayRules();
  const entryMode = getRoleplayEntryMode(message, config);
  const entryDefinition = entryMode
    ? config?.entry_modes?.[entryMode]
    : null;
  const marker = config?.state?.marker ||
    "[[PENDING_ACTION:ROLEPLAY_ACTIVE]]";

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
    `Marker-regel: Afslut alle svar i det aktive spor med ${marker} som allersidste tegn. Markøren vises ikke til brugeren. Udelad kun markøren, når rollespillet reelt afsluttes, eller brugeren tydeligt skifter emne.`,
    "Opfind aldrig egne kommandoer, motornavne eller statusbeskeder.",
  ].join("\n");
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
  const reply = text.split(marker).join("").trim();

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

  if (!isRoleplayContextActive(message, pendingAction, config)) {
    return null;
  }

  if (!openai?.responses?.create) {
    throw new Error("OpenAI-klient mangler i roleplayEngine");
  }

  const runtime = config.runtime || {};
  const selectedModel = model || runtime.model || "gpt-5.4-mini";
  const allowedToolNames = new Set(
    Array.isArray(runtime.allowed_tools) ? runtime.allowed_tools : []
  );
  const roleplayTools = (Array.isArray(tools) ? tools : []).filter(
    (tool) => allowedToolNames.has(tool?.name)
  );
  const roleplayInstructions = [
    heidiPrompt,
    buildRoleplayRuleInjection({
      message,
      pendingAction,
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
    input: contextualInput || message,
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

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(executeTool(toolCall)),
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

  return {
    reply: parsedOutput.reply,
    pendingAction: parsedOutput.pendingAction,
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
      entry_mode: getRoleplayEntryMode(message, config),
      continued_from_pending:
        pendingAction === config.pending_action,
      explicit_exit: isRoleplayExitMessage(message, config),
    },
  };
}

export {
  buildRoleplayRuleInjection,
  getRoleplayConfiguration,
  getRoleplayEntryMode,
  getRollespil,
  isRoleplayContextActive,
  isRoleplayExitMessage,
  isRoleplayTriggerMessage,
  parseRoleplayOutput,
  runRoleplayFlow,
};
