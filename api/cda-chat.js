import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  buildBornehavePracticeContext,
  extractBornehaveAge,
  isBornehavePracticeRequest,
  routeBornehaveInput,
} from "../lib/bornehaveRouter.js";
import {
  isContextualDiagnosisFollowup,
  runHeidiFlow,
  shouldBlockTemplateAutoRouting,
} from "../lib/heidiFlow.js";
import { runSpecialistFlow } from "../lib/specialistEngine.js";
import {
  createReadableStudentProfileText,
  createStudentProfileFromText,
  isReadableStudentProfileRequest,
  isStudentProfileRequest,
} from "../lib/elevprofilEngine.js";
import {
  getTemplates,
  normalizeTemplateSearch,
  runTemplateResourceFlow,
} from "../lib/templateResourceEngine.js";
import {
  buildActiveLocalCaseFollowupReply,
  buildDirectLocalCaseReply,
  buildLocalCaseNavigationResult,
  buildLocalCaseNavState,
  buildReturnToActiveCaseReply,
  encodeLocalCaseNavState,
  findBestDirectLocalCase,
  findBestOtherExperienceCase,
  formatLocalCaseValue,
  getPendingActionForSpecialistResponse,
  getSemanticSearch,
  isDirectLocalCaseRequest,
  isLocalCaseFollowupRequest,
  isLocalCaseNavigationRequest,
  isOtherExperienceCaseRequest,
  isReturnToActiveCaseRequest,
  preserveActiveLocalCasePendingAction,
  resolveActiveLocalCase,
  resolveActiveLocalCaseForSpecialistRequest,
  shouldPreferActiveCaseContextForSpecialist,
} from "../lib/localCaseEngine.js";
import {
  findLocalPblSignals,
  getPblProjects,
  runPblFlow,
} from "../lib/pblEngine.js";
import { runRoleplayFlow } from "../lib/roleplayEngine.js";
import {
  buildParentDayPlanMessageReply,
  buildPracticalDayPlanReply,
  getPracticalDayPlanMode,
  isParentDayPlanMessageRequest,
  isPracticalDayPlanRequest,
} from "../lib/dayPlanEngine.js";
import {
  buildAutomaticComorbidityContext,
  buildLocalDiagnosisSessionPrompt,
  buildLocalDiagnosisTheoryReply,
  buildStructuredDiagnosisContext,
  findStructuredDiagnosisMatches,
  getDiagnoser,
  getKomorbiditet,
  getLocalDiagnosisSessionMeta,
  getSingleStructuredDiagnosisMatch,
  isConcreteKnownDiagnosisCase,
  isLocalDiagnosisStop,
  isLocalDiagnosisTheoryFollowup,
  isLocalDiagnosisTheoryRequest,
  loadStructuredDiagnosis,
} from "../lib/diagnosisEngine.js";
import {
  containsDiagnosisPhrase,
  normalizeDiagnosisPhrase,
} from "../lib/textNormalize.js";
import {
  getEmotionAnalysis,
  isEmotionAnalysisRequest,
  runEmotionFlow,
} from "../lib/emotionEngine.js";
import {
  cleanCdaReplyTail,
  extractPendingAction,
  normalizeReplyIntent,
  shouldUseSpecializedToolFlow,
} from "../lib/replyIntent.js";
import {
  buildActiveCaseInstructions,
  buildContextualInput,
  hasActiveCaseContext,
  sanitizeActiveCaseContext,
} from "../lib/activeCaseContext.js";

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

function isCdaInternalDataSourceQuestion(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  const sourceQuestionPatterns = [
    "hvor far du dine data fra",
    "hvor faar du dine data fra",
    "hvor får du dine data fra",
    "far du data fra interne filer",
    "faar du data fra interne filer",
    "får du data fra interne filer",
    "bruger du interne filer",
    "henter du data fra interne filer",
    "bruger du cda data",
    "bruger du cda-data",
    "bruger du internet",
    "henter du fra internet",
    "hvilke data bruger du",
    "hvilke kilder bruger du",
  ].map((pattern) => normalizeDiagnosisPhrase(pattern));

  return sourceQuestionPatterns.some((pattern) => text.includes(pattern));
}

function buildCdaInternalDataSourceReply() {
  return [
    "Ja — CDA Engine bruger interne CDA-datafiler og regler, når de er relevante for spørgsmålet.",
    "",
    "Det er ikke det samme som dine private filer eller dokumenter på din computer. Dem kan CDA ikke åbne, medmindre du selv deler indholdet i samtalen.",
    "",
    "I CDA-flowet kan systemet bruge fx:",
    "- aktiv case og samtalekontekst",
    "- CDA_HeidiPrompt.md",
    "- data/prompt_rules.json",
    "- specialistdata fra data/CDA_SpecialistPanel.json",
    "- relevante CDA-data om diagnoser, cases, skabeloner, komorbiditet, PBL, emotion og børnehavespor",
    "",
    "Internet eller generel viden er sekundært og må ikke være første valg inden for CDA’s eget område.",
  ].join("\n");
}

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

if (toolCall.name === "getSemanticSearch") {
  return getSemanticSearch(args);
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
  const heidiPrompt = readHeidiPrompt();

  const roleplayResult = await runRoleplayFlow({
    openai,
    message,
    pendingAction: pending_action,
    role,
    language,
  });

  if (roleplayResult) {
    const usageByCall = roleplayResult.usage || [];
    const totals = usageByCall.reduce(
      (sum, item) => ({
        input_tokens: sum.input_tokens + Number(item.input_tokens || 0),
        output_tokens: sum.output_tokens + Number(item.output_tokens || 0),
        total_tokens: sum.total_tokens + Number(item.total_tokens || 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    );

    console.log("CDA værktøjskald:", {
      tools_used: roleplayResult.usedTools,
      tool_debug: roleplayResult.toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: usageByCall,
      totals,
    });

    if (adgangskode && totals.total_tokens > 0) {
      const supabase = getSupabase();
      const { error: forbrugsFejl } = await supabase
        .from("token_forbrug")
        .insert({
          adgangskode: adgangskode.trim().toUpperCase(),
          system: "cda",
          udbyder: "openai",
          model: roleplayResult.model,
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          samlet_tokens: totals.total_tokens,
        });

      if (forbrugsFejl) {
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    return res.status(200).json({
      success: true,
      reply: roleplayResult.reply,
      model: roleplayResult.model,
      tools_used: roleplayResult.usedTools,
      tool_debug: roleplayResult.toolDebug,
      used_data_sources: roleplayResult.usedDataSources,
      conversation_mode: roleplayResult.conversationMode,
      pending_action: roleplayResult.pendingAction,
    });
  }
  const templateResult = await runTemplateResourceFlow({
    openai,
    model: "gpt-5.4-mini",
    message,
    language,
    role,
    responseStyle: response_style,
    heidiPrompt,
    audienceInstructions,
    allowRouting: !shouldBlockTemplateAutoRouting({
      message,
      activeCaseContext,
    }),
  });

  if (templateResult) {
    const usageByCall = templateResult.usage || [];
    const totals = usageByCall.reduce(
      (sum, item) => ({
        input_tokens: sum.input_tokens + Number(item.input_tokens || 0),
        output_tokens: sum.output_tokens + Number(item.output_tokens || 0),
        total_tokens: sum.total_tokens + Number(item.total_tokens || 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    );

    console.log("CDA værktøjskald:", {
      tools_used: templateResult.usedTools,
      tool_debug: templateResult.toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: usageByCall,
      totals,
    });

    if (adgangskode && totals.total_tokens > 0) {
      const supabase = getSupabase();
      const { error: forbrugsFejl } = await supabase
        .from("token_forbrug")
        .insert({
          adgangskode: adgangskode.trim().toUpperCase(),
          system: "cda",
          udbyder: "openai",
          model: templateResult.model,
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          samlet_tokens: totals.total_tokens,
        });

      if (forbrugsFejl) {
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    const templateActiveLocalCase = resolveActiveLocalCase(
      pending_action,
      activeCaseContext
    );

    return res.status(200).json({
      success: true,
      reply: templateResult.reply,
      model: templateResult.model,
      tools_used: templateResult.usedTools,
      tool_debug: templateResult.toolDebug,
      used_data_sources: templateResult.usedDataSources,
      conversation_mode: "template_resource",
      pending_action: preserveActiveLocalCasePendingAction(
        templateActiveLocalCase,
        pending_action
      ),
    });
  }

  if (isEmotionAnalysisRequest(message)) {
    const emotionResult = await runEmotionFlow({
      openai,
      model: "gpt-5.4-mini",
      heidiPrompt,
      audienceInstructions,
      activeCaseInstructions,
      message,
      language,
      role,
      responseStyle: response_style,
    });

    const emotionReplyData = extractPendingAction(emotionResult.outputText);
    const reply = cleanCdaReplyTail(emotionReplyData.reply);
    const inputTokens = Number(
      emotionResult.response?.usage?.input_tokens || 0
    );
    const outputTokens = Number(
      emotionResult.response?.usage?.output_tokens || 0
    );
    const totalTokens = Number(
      emotionResult.response?.usage?.total_tokens ||
        inputTokens + outputTokens
    );

    const usedTools = ["emotionEngineV2"];
    const toolDebug = [
      {
        name: "emotionEngineV2",
        action: "analyze_adult_communication",
        ...emotionResult.debug,
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
          phase: "emotion_engine_v2",
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
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    return res.status(200).json({
      success: true,
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      used_data_sources: emotionResult.usedDataSources,
      conversation_mode: "emotion_analysis",
      pending_action: emotionReplyData.pendingAction,
    });
  }

  const pblResult = await runPblFlow({
    openai,
    message,
    pendingAction: pending_action,
    activeCaseContext,
  });

  if (pblResult) {
    const usageByCall = pblResult.usage || [];
    const totals = usageByCall.reduce(
      (sum, item) => ({
        input_tokens: sum.input_tokens + Number(item.input_tokens || 0),
        output_tokens: sum.output_tokens + Number(item.output_tokens || 0),
        total_tokens: sum.total_tokens + Number(item.total_tokens || 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    );

    console.log("CDA værktøjskald:", {
      tools_used: pblResult.usedTools,
      tool_debug: pblResult.toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: usageByCall,
      totals,
    });

    if (adgangskode && totals.total_tokens > 0) {
      const supabase = getSupabase();
      const { error: forbrugsFejl } = await supabase
        .from("token_forbrug")
        .insert({
          adgangskode: adgangskode.trim().toUpperCase(),
          system: "cda",
          udbyder: "openai",
          model: pblResult.model,
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          samlet_tokens: totals.total_tokens,
        });

      if (forbrugsFejl) {
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    return res.status(200).json({
      success: true,
      reply: pblResult.reply,
      model: pblResult.model,
      tools_used: pblResult.usedTools,
      tool_debug: pblResult.toolDebug,
      used_data_sources: pblResult.usedDataSources,
      conversation_mode: "pbl",
      pending_action: pblResult.pendingAction,
    });
  }

  const activeLocalCaseBeforeContextualFollowup = resolveActiveLocalCase(
    pending_action,
    activeCaseContext
  );

  if (
    !isDirectLocalCaseRequest(message) &&
    !(
      activeLocalCaseBeforeContextualFollowup &&
      isLocalCaseFollowupRequest(message)
    ) &&
    isContextualDiagnosisFollowup({ message, activeCaseContext })
  ) {
    const heidiFlowResult = await runHeidiFlow({
      openai,
      model: "gpt-5.4-mini",
      heidiPrompt,
      audienceInstructions,
      activeCaseInstructions,
      contextualInput,
      message,
      language,
      role,
      responseStyle: response_style,
      activeCaseContext,
      mode: "contextual_diagnosis_followup",
    });

    const heidiFlowReplyData = extractPendingAction(heidiFlowResult.outputText);
    const reply = cleanCdaReplyTail(heidiFlowReplyData.reply);

    const inputTokens = Number(heidiFlowResult.response?.usage?.input_tokens || 0);
    const outputTokens = Number(heidiFlowResult.response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      heidiFlowResult.response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "heidi_flow_contextual_diagnosis",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["heidiFlowV1"];
    const toolDebug = [
      {
        name: "heidiFlowV1",
        action: "contextual_diagnosis_followup",
        ...heidiFlowResult.debug,
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
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    return res.status(200).json({
      success: true,
      reply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      used_data_sources: heidiFlowResult.usedDataSources,
      conversation_mode: "heidi_case",
      pending_action: heidiFlowReplyData.pendingAction,
    });
  }

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

  const specialistActiveLocalCase = resolveActiveLocalCaseForSpecialistRequest(
    pending_action,
    activeCaseContext
  );
  const specialistPendingAction = getPendingActionForSpecialistResponse(
    specialistActiveLocalCase,
    activeCaseContext,
    pending_action
  );
  const specialistContextSource = specialistActiveLocalCase
    ? "active_local_case"
    : shouldPreferActiveCaseContextForSpecialist(activeCaseContext)
      ? "active_case_context_preferred"
      : "active_case_context";

  const specialistResult = await runSpecialistFlow({
    openai,
    message,
    activeCase: specialistActiveLocalCase,
    activeContext: activeCaseContext,
    pendingAction: specialistPendingAction,
    role,
    responseStyle: response_style,
    contextSource: specialistContextSource,
  });

  if (specialistResult) {
    const usageByCall = specialistResult.usage || [];
    const totals = usageByCall.reduce(
      (sum, item) => ({
        input_tokens: sum.input_tokens + Number(item.input_tokens || 0),
        output_tokens: sum.output_tokens + Number(item.output_tokens || 0),
        total_tokens: sum.total_tokens + Number(item.total_tokens || 0),
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    );

    console.log("CDA værktøjskald:", {
      tools_used: specialistResult.usedTools,
      tool_debug: specialistResult.toolDebug,
    });

    console.log("CDA tokenmåling pr. OpenAI-kald:", {
      usage_by_call: usageByCall,
      totals,
    });

    if (adgangskode && totals.total_tokens > 0) {
      const supabase = getSupabase();
      const { error: forbrugsFejl } = await supabase
        .from("token_forbrug")
        .insert({
          adgangskode: adgangskode.trim().toUpperCase(),
          system: "cda",
          udbyder: "openai",
          model: specialistResult.model,
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          samlet_tokens: totals.total_tokens,
        });

      if (forbrugsFejl) {
        console.error("Kunne ikke gemme tokenforbrug:", forbrugsFejl);
      }
    }

    return res.status(200).json({
      success: true,
      reply: cleanCdaReplyTail(specialistResult.reply),
      model: specialistResult.model,
      tools_used: specialistResult.usedTools,
      tool_debug: specialistResult.toolDebug,
      used_data_sources: specialistResult.usedDataSources,
      conversation_mode: specialistResult.conversationMode,
      pending_action: specialistResult.pendingAction,
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
        reply: cleanCdaReplyTail(response.output_text),
        model: "gpt-5.4-mini",
        tools_used: usedTools,
        tool_debug: toolDebug,
        pending_action: null,
      });
    }
  }

  // Et aktivt rollespil er allerede håndteret af roleplayEngine ovenfor.

  if (isCdaInternalDataSourceQuestion(message)) {
    const reply = buildCdaInternalDataSourceReply();
    const usedTools = ["localCdaSourceContract"];
    const toolDebug = [
      {
        name: "localCdaSourceContract",
        source: "cda_internal_runtime_contract",
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

  if (isReadableStudentProfileRequest(message)) {
    const profileTextResult = await createReadableStudentProfileText(message, language, openai);
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
    const profileResult = await createStudentProfileFromText(message, language, openai);
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

  const structuredDiagnosisMeta = getSingleStructuredDiagnosisMatch(message);

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

    // Fast raekkefoelge, hver gang en diagnose genkendes i en konkret
    // sammenhaeng (ikke et rent teori-spoergsmaal, det er allerede
    // besvaret 0-tokens lokalt tidligere i flowet): diagnose- og
    // komorbiditets-data hentes ALTID, uafhaengigt af formulering.
    // Om komorbiditet rent faktisk naevnes i svaret, styres stadig af
    // comorbidity_rules i prompt_rules.json (kun naar det giver mening,
    // aldrig som fast saetning, aldrig som halv diagnose).
    const automaticComorbidityContext = buildAutomaticComorbidityContext(
      structuredDiagnosisMeta
    );

    // PBL-signaler: gratis, lokalt opslag i jeres 61 forloeb, matchet paa
    // diagnose og eventuelle interesse-/styrke-ord i selve beskeden (fx
    // "teknik"). Tom liste, hvis intet reelt signal findes - saa naevnes
    // PBL slet ikke, for at undgaa stoej.
    const localPblSignals = findLocalPblSignals(
      message,
      structuredDiagnosisMeta
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
      "Udfør ikke Analyse-systemets fulde caseanalyse i dette flow.",
      "Hvis brugeren spørger, om noget KAN VÆRE en bestemt diagnose (fx 'kan det være ADHD?'), skal du aldrig svare ja eller nej. Beskriv i stedet, om det beskrevne mønster minder om eller kan tyde på det, ud fra CDA-data. Hvis mønsteret er tydeligt og vedvarende, anbefal at sagen tages op med AKT, PPR eller en relevant specialist. Vær forsigtig og understøttende, ikke bekræftende eller afvisende.",
      "",
      "KOMORBIDITET (vedlagt nedenfor)",
      "Vurder først, om observationerne kan forklares rimeligt inden for den kendte diagnose. Hvis de kan, skal du ikke gøre komorbiditet til et tema.",
      "Brug kun komorbiditetsdata, når observationerne tydeligt ligger ud over eller afviger fra det forventede billede ved den kendte diagnose.",
      "Sig aldrig, at CDA eller brugeren har fundet eller påvist en komorbiditet. Stil aldrig en ny diagnose, og skriv ikke 'måske autisme', 'måske depression' eller tilsvarende på baggrund af en kort beskrivelse.",
      "Omsæt de interne spor til neutrale observationsområder som fx bekymring og undgåelse, social belastning, energifald og funktionsændring, rigiditet, sansning eller vedvarende konfliktmønstre.",
      "Ved rene teori-/definitionsspørgsmål (fx 'hvad er autisme') må komorbiditet ALDRIG nævnes, uanset hvad der er vedlagt. Det gælder kun konkrete situationer.",
      localPblSignals.length > 0
        ? [
            "",
            "PBL-FORLØB (vedlagt nedenfor)",
            "Hvis beskeden tydeligt afslører en reel interesse eller styrke hos barnet (fx et konkret emne, eleven fordyber sig i), kan du kort nævne 1 relevant forløb fra listen som en mulig vej at gå.",
            "Nævn det kun, hvis det giver ægte mening ud fra det, brugeren faktisk har skrevet. Opfind ikke en interesse, brugeren ikke har nævnt. Beskriv det som en mulighed, ikke en anbefaling eller konklusion.",
            "Start ikke selve PBL-forløbet her. Bed brugeren om selv at bede om det, hvis relevant.",
          ].join("\n")
        : "",
      role === "Specialist"
        ? "Svar fagperson til fagperson med præcist specialistsprog, men hold dig til det konkrete spørgsmål og lav ikke en fuld Analyse-vurdering. Skeln tydeligt mellem observation, hypotese og konklusion, og henvis ikke automatisk brugeren til PPR."
        : role === "Forælder"
          ? "Forældresvaret skal tage udgangspunkt i hjemmet og familiens hverdag. Antag aldrig, at barnet viser samme adfærd hjemme og i skolen. Skolen må kun nævnes kort som en mulig sammenligning, fx at spørge læreren, hvad læreren ser. Forskelle mellem hjem og skole kan have mange forklaringer og må ikke tolkes sikkert. Giv højst 3 konkrete råd og afslut uden et generisk tilbud eller et automatisk spørgsmål."
          : "Hold svaret praksisnært og direkte anvendeligt for den valgte rolle. I kort normal drift: giv højst 3 konkrete handlinger.",
      `AKTUEL SVARSTIL: ${response_style}`,
      response_style === "Kort"
        ? "Svar kort og direkte."
        : response_style === "Dyb"
          ? "Uddyb relevante faglige sammenhænge, men undgå unødvendig teori og gentagelser."
          : "Giv en kort forklaring og konkrete relevante hensyn.",
    ].filter(Boolean).join("\n");

    const diagnosisInput = [
      "BRUGERENS SPØRGSMÅL:",
      message,
      "",
      "RELEVANTE STRUKTUREREDE CDA-DIAGNOSEDATA:",
      JSON.stringify(diagnosisContext, null, 2),
      automaticComorbidityContext
        ? [
            "",
            "RELEVANTE CDA-DATA TIL OBSERVATIONSSAMMENLIGNING (komorbiditet):",
            JSON.stringify(automaticComorbidityContext, null, 2),
          ].join("\n")
        : "",
      localPblSignals.length > 0
        ? [
            "",
            "RELEVANTE PBL-FORLØB (kun til orientering, brug kun hvis det giver mening):",
            JSON.stringify(localPblSignals, null, 2),
          ].join("\n")
        : "",
    ].filter(Boolean).join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: {
        effort: "low",
      },
      instructions: diagnosisInstructions,
      input: diagnosisInput,
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
        phase: "structured_diagnosis_local_routing",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = [
      "localStructuredDiagnosisRouting",
      ...(automaticComorbidityContext ? ["localAutomaticComorbidityRouting"] : []),
      ...(localPblSignals.length > 0 ? ["localPblSignalRouting"] : []),
    ];
    const toolDebug = [
      {
        name: "localStructuredDiagnosisRouting",
        diagnosis_id: structuredDiagnosisMeta.id,
        diagnosis_file: structuredDiagnosisMeta.fil,
        selected_sections: selectedSections,
        comorbidity_available: Boolean(automaticComorbidityContext),
        pbl_signal_count: localPblSignals.length,
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

    const diagnosisReplyData = extractPendingAction(response.output_text);
    const diagnosisReply = cleanCdaReplyTail(diagnosisReplyData.reply);

    return res.status(200).json({
      success: true,
      reply: diagnosisReply,
      model: "gpt-5.4-mini",
      tools_used: usedTools,
      tool_debug: toolDebug,
      pending_action: diagnosisReplyData.pendingAction,
    });
  }


  if (!shouldUseSpecializedToolFlow(message)) {
    const heidiFlowResult = await runHeidiFlow({
      openai,
      model: "gpt-5.4-mini",
      heidiPrompt,
      audienceInstructions,
      activeCaseInstructions,
      contextualInput,
      message,
      language,
      role,
      responseStyle: response_style,
      activeCaseContext,
      mode: role === "Specialist" ? "specialist_without_analysis_module" : "normal",
    });

    const heidiFlowReplyData = extractPendingAction(heidiFlowResult.outputText);
    const normalReply = cleanCdaReplyTail(heidiFlowReplyData.reply);

    const inputTokens = Number(heidiFlowResult.response?.usage?.input_tokens || 0);
    const outputTokens = Number(heidiFlowResult.response?.usage?.output_tokens || 0);
    const totalTokens = Number(
      heidiFlowResult.response?.usage?.total_tokens || inputTokens + outputTokens
    );

    const usageByCall = [
      {
        call: 1,
        phase: "heidi_flow_v1_normal",
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ];

    const usedTools = ["heidiFlowV1"];
    const toolDebug = [
      {
        name: "heidiFlowV1",
        action: role === "Specialist" ? "specialist_without_analysis_module" : "normal",
        ...heidiFlowResult.debug,
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
      used_data_sources: heidiFlowResult.usedDataSources,
      conversation_mode: "heidi_case",
      pending_action: heidiFlowReplyData.pendingAction,
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
    reply: cleanCdaReplyTail(runtimeReplyData.reply),
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
