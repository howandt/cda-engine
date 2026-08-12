import fs from "fs";
import path from "path";

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("SpecialistEngine kunne ikke læse JSON:", filePath, error.message);
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value, maxLength = 900) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function formatCaseValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(formatCaseValue).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function limitText(value, max = 260) {
  const text = formatCaseValue(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function includesAny(text, patterns) {
  const normalized = normalizeText(text);
  return patterns.some((pattern) => normalized.includes(normalizeText(pattern)));
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

function combinedCaseText(message, activeLocalCase, activeCaseContext) {
  return [
    activeLocalCase?.titel,
    activeLocalCase?.title,
    activeLocalCase?.problem,
    activeLocalCase?.kort_beskrivelse,
    activeLocalCase?.description,
    activeLocalCase?.beskrivelse,
    activeLocalCase?.barnets_oplevelse,
    activeLocalCase?.barnets_perspektiv,
    activeLocalCase?.typisk_fejl,
    activeLocalCase?.løsning,
    activeLocalCase?.loesning,
    activeLocalCase?.tiltag,
    activeLocalCase?.værktøjer,
    activeCaseContext?.summary,
    activeCaseContext?.known_context,
    activeCaseContext?.last_user_message,
    activeCaseContext?.last_heidi_reply,
    activeCaseContext?.last_guidance_summary,
    message,
  ].filter(Boolean).join("\n");
}

function loadSpecialistPanelData() {
  const dataPath = path.join(process.cwd(), "data", "CDA_SpecialistPanel.json");
  const data = readJsonIfExists(dataPath, null);
  return {
    success: Boolean(data),
    source: "local",
    data,
  };
}

function getSpecialists() {
  const panel = loadSpecialistPanelData();
  return Array.isArray(panel?.data?.specialists) ? panel.data.specialists : [];
}

function specialistHaystack(specialist) {
  return normalizeText([
    specialist?.id,
    specialist?.name,
    specialist?.category,
    specialist?.group,
    specialist?.function,
    specialist?.disclaimer,
    specialist?.voice_profile?.tone,
    specialist?.voice_profile?.style,
    ...(Array.isArray(specialist?.keywords) ? specialist.keywords : []),
  ].filter(Boolean).join(" "));
}

function specialistPersonalName(specialist) {
  const name = String(specialist?.name || "").replace(/^AI[-\s]*/i, "").trim();
  const stopWords = new Set([
    "psychologist", "child", "and", "adolescent", "psychiatrist", "crisis", "intervention",
    "specialist", "neuropsychologist", "behavioral", "analyst", "bcba", "occupational", "therapist",
    "sensory", "integration", "interior", "architect", "for", "special", "needs", "speech", "language",
    "pathologist", "educator", "dyslexia", "pbl", "facilitator", "tech", "physiotherapist",
    "health", "nurse", "nutrition", "expert", "pediatrician", "sleep", "medicine", "family",
    "counselor", "social", "worker", "music", "legal", "advisor", "coach"
  ]);

  const parts = name
    .split(/\s+/)
    .filter((part) => part && !stopWords.has(part.toLowerCase().replace(/[^a-z]/g, "")));

  return parts.join(" ").trim();
}

function findNamedSpecialist(message) {
  const specialists = getSpecialists();
  const text = normalizeText(message);

  return specialists.find((specialist) => {
    const id = normalizeText(specialist?.id);
    const fullName = normalizeText(specialist?.name);
    const personalName = normalizeText(specialistPersonalName(specialist));
    const lastName = normalizeText(personalName.split(" ").filter(Boolean).slice(-1)[0]);

    return (
      (id && text.includes(id)) ||
      (fullName && text.includes(fullName)) ||
      (personalName.length >= 4 && text.includes(personalName)) ||
      (lastName.length >= 4 && text.includes(lastName))
    );
  }) || null;
}

export function isDirectSpecialistPanelRequest(message) {
  const text = normalizeText(message);
  const directPatterns = [
    "specialistpanel",
    "specialist panel",
    "hvad siger specialisterne",
    "specialistperspektiv",
    "specialistvinkel",
    "specialist vinkler",
    "hvilke specialistvinkler",
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

  if (directPatterns.some((pattern) => text.includes(normalizeText(pattern)))) return true;
  return Boolean(findNamedSpecialist(message));
}

export function isCaseSpecialistsInvolvedRequest(message) {
  const text = normalizeText(message);
  const directPatterns = [
    "hvilke specialister har været inde over",
    "hvilke specialister har vaeret inde over",
    "hvilke specialister har set på",
    "hvilke specialister har set paa",
    "hvilke specialister har været involveret",
    "hvilke specialister har vaeret involveret",
    "hvilke specialister er relevante for denne case",
    "hvilke specialister er relevante for denne sag",
    "hvem har kigget på denne case",
    "hvem har kigget paa denne case",
    "hvem har kigget på denne sag",
    "hvem har kigget paa denne sag",
    "specialister involveret i denne sag",
    "specialister involveret i denne case",
    "hvilket specialistteam",
  ];

  return directPatterns.some((pattern) => text.includes(normalizeText(pattern)));
}

export function isLocalPprCaseAngleRequest(message) {
  const text = normalizeText(message);
  if (!text.includes("ppr")) return false;

  const pprPatterns = [
    "ppr",
    "hvad siger ppr",
    "hvad ville ppr",
    "hvad vil ppr",
    "hvad ser ppr",
    "hvad ville ppr se",
    "hvad ville ppr kigge på",
    "hvad ville ppr kigge paa",
    "ppr vinkel",
    "ppr-vinkel",
    "ppr se",
    "ppr spørge",
    "ppr spoerge",
  ];

  return pprPatterns.some((pattern) => text === normalizeText(pattern) || text.includes(normalizeText(pattern)));
}

function getRequestedAngle(message) {
  const text = normalizeText(message);
  if (findNamedSpecialist(message)) return "named";
  if (text.includes("psykolog")) return "psychologist";
  if (text.includes("ppr")) return "ppr";
  if (isCaseSpecialistsInvolvedRequest(message)) return "case_team";
  return "specialists";
}

function buildPprAngleReply(caseData, activeContext) {
  const title = formatCaseValue(caseData?.titel || caseData?.title || caseData?.id || "Aktiv sag");
  const problem = limitText(
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
    lines.push("**PPR-vinkel**", `Ud fra ${title}${problem ? `: ${problem}` : ""}`);
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
      `id: ${limitText(caseData.id, 80) || "-"}`,
      `titel: ${limitText(caseData.titel || caseData.title, 120) || "-"}`,
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
      const text = limitText(value, max);
      if (text) lines.push(`${label}: ${text}`);
    }

    return lines.join("\n");
  }

  if (hasActiveCaseContext(activeContext)) {
    return [
      "AKTIV SAG — KORT GRUNDLAG",
      activeContext.summary ? `sag: ${limitText(activeContext.summary, 420)}` : "",
      activeContext.known_context ? `kontekst: ${limitText(activeContext.known_context, 220)}` : "",
      activeContext.last_user_message ? `sidste brugerbesked: ${limitText(activeContext.last_user_message, 300)}` : "",
      activeContext.last_guidance_summary ? `seneste råd: ${limitText(activeContext.last_guidance_summary, 260)}` : "",
    ].filter(Boolean).join("\n");
  }

  return "";
}

function displayRoleLabel(specialist, angle = "specialists") {
  const haystack = specialistHaystack(specialist);
  const category = normalizeText(specialist?.category);

  if (angle === "ppr" || haystack.includes("ppr") || haystack.includes("skolepsykolog")) return "AI-PPR-/teamblik";
  if (haystack.includes("interdisciplinary") || haystack.includes("tvaerfag") || haystack.includes("tværfag") || haystack.includes("koordinering")) return "AI-tværfagligt/teamblik";
  if (haystack.includes("special educator") || haystack.includes("klasseledelse") || category === "education_learning") return "AI-specialpædagogisk blik";
  if (category === "psychology" || haystack.includes("psychologist")) return "AI-psykologisk blik";
  if (category === "psychiatry" || haystack.includes("psychiatrist")) return "AI-børnepsykiatrisk blik";
  if (category === "crisis_intervention" || haystack.includes("affekt") || haystack.includes("nedtrapning")) return "AI-affekt-/nedtrapningsblik";
  if (category === "behavior_cognition" || haystack.includes("impulskontrol") || haystack.includes("adfaerd")) return "AI-adfærds-/reguleringsblik";
  if (category === "family_social") return "AI-skole-hjem-/netværksblik";
  if (category === "communication_language") return "AI-kommunikations-/sprogblik";
  if (category === "sensory_integration" || category === "therapy" || category === "environment_design") return "AI-sanse-/miljøblik";
  if (category === "physical_health") return "AI-krops-/sundhedsblik";

  return "AI-specialistblik";
}

function cleanValue(value, max = 180) {
  return limitText(value, max)
    .replace(/[|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSpecialist(specialist, words, angle, caseText) {
  const haystack = specialistHaystack(specialist);
  let score = 0;

  const anglePatterns = {
    named: [],
    psychologist: ["psykolog", "psychologist", "psychology", "angst", "stress", "cbt", "terapi"],
    ppr: ["ppr", "skolepsykolog", "raadgivning", "rådgivning", "observation", "indstilling", "stotte", "støtte"],
    specialists: [],
    case_team: ["ppr", "stotte", "støtte", "skole", "familie", "social", "netvaerk", "netværk"],
  };

  for (const pattern of anglePatterns[angle] || []) {
    if (haystack.includes(normalizeText(pattern))) score += 40;
  }

  for (const word of words) {
    if (haystack.includes(word)) score += 4;
  }

  const normalizedCase = normalizeText(caseText);
  const category = normalizeText(specialist?.category);

  if (includesAny(normalizedCase, ["uro", "impuls", "konflikt", "drilleri", "navne", "vred", "vrede", "affekt", "regulering"])) {
    if (["behavior_cognition", "crisis_intervention"].includes(category)) score += 25;
  }
  if (includesAny(normalizedCase, ["frikvarter", "overgang", "struktur", "rutine", "klasse", "undervisning", "timestart"])) {
    if (category === "education_learning" || haystack.includes("struktur")) score += 25;
  }
  if (includesAny(normalizedCase, ["afvist", "udenfor", "piger", "relation", "social", "hjem", "forældre", "foraeldre"])) {
    if (category === "family_social" || category === "communication_language" || category === "psychology") score += 18;
  }
  if (includesAny(normalizedCase, ["adhd", "opmærksomhed", "opmaerksomhed", "impulskontrol", "selvregulering"])) {
    if (category === "behavior_cognition" || category === "psychiatry" || category === "education_learning") score += 18;
  }

  return score;
}

function ensureDiverseSelection(scored, desiredCount, angle, caseText) {
  const selected = [];
  const usedLabels = new Set();

  const addCandidate = (candidate) => {
    if (!candidate || selected.length >= desiredCount) return false;
    if (selected.some((item) => item.specialist?.id === candidate.specialist?.id)) return false;

    const label = displayRoleLabel(candidate.specialist, angle);
    if (usedLabels.has(label)) return false;

    selected.push(candidate);
    usedLabels.add(label);
    return true;
  };

  if (angle === "specialists") {
    const preferredGroups = [
      (item) => normalizeText(item.specialist?.category) === "education_learning",
      (item) => ["behavior_cognition", "crisis_intervention"].includes(normalizeText(item.specialist?.category)),
      (item) => ["psychology", "family_social", "communication_language"].includes(normalizeText(item.specialist?.category)),
    ];

    for (const matcher of preferredGroups) {
      const candidate = scored.find((item) => item.score > 0 && matcher(item));
      addCandidate(candidate);
    }
  }

  for (const item of scored) {
    if (selected.length >= desiredCount) break;
    if (item.score <= 0 && selected.length > 0) continue;
    addCandidate(item);
  }

  if (selected.length < desiredCount) {
    const preferred = [
      "ai_special_educator_frederik_birk",
      "ai_behavioral_analyst_max_taylor",
      "ai_crisis_specialist_anna_rydell",
      "ai_psychologist_sara_holm",
      "ai_social_worker_rune_laursen",
    ];

    for (const id of preferred) {
      if (selected.length >= desiredCount) break;
      const candidate = scored.find((item) => String(item.specialist?.id || "") === id);
      addCandidate(candidate);
    }
  }

  if (selected.length < desiredCount) {
    for (const item of scored) {
      if (selected.length >= desiredCount) break;
      if (!selected.some((chosen) => chosen.specialist?.id === item.specialist?.id)) selected.push(item);
    }
  }

  return selected.slice(0, desiredCount);
}

function selectSpecialistPanel({ angle, message, activeLocalCase, activeCaseContext }) {
  const specialists = getSpecialists();
  const caseText = combinedCaseText(message, activeLocalCase, activeCaseContext);
  const text = normalizeText(caseText);
  const words = new Set(text.split(" ").filter((word) => word.length >= 4));

  if (angle === "named") {
    const named = findNamedSpecialist(message);
    return named ? [named] : [];
  }

  const desiredCount = angle === "case_team" ? 4 : angle === "psychologist" || angle === "ppr" ? 1 : 3;

  const scored = specialists
    .map((specialist, index) => ({
      specialist,
      score: scoreSpecialist(specialist, words, angle, caseText),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return ensureDiverseSelection(scored, desiredCount, angle, caseText).map((item) => item.specialist);
}

function buildSpecialistIndexText(selected, angle) {
  const rows = selected.map((specialist) => {
    const keywords = Array.isArray(specialist?.keywords) ? specialist.keywords.slice(0, 10).join(", ") : "";
    return [
      cleanValue(specialist?.id, 80),
      cleanValue(displayRoleLabel(specialist, angle), 120),
      cleanValue(specialist?.name, 130),
      cleanValue(specialist?.group, 120),
      cleanValue(specialist?.function, 240),
      cleanValue(keywords, 220),
      cleanValue(specialist?.voice_profile?.tone, 80),
      cleanValue(specialist?.voice_profile?.style, 120),
      cleanValue(specialist?.disclaimer, 180),
    ].join("|");
  });

  return [
    "KOLONNER:id|visningsrolle|navn_i_data|gruppe|funktion|keywords|tone|stil|disclaimer",
    ...rows,
  ].join("\n");
}

function formatSpecialistPanelReply({ selected, panelResponse, angle }) {
  const byId = new Map(selected.map((specialist) => [String(specialist?.id || ""), specialist]));
  const used = new Set();
  const panels = [];

  const responsePanels = Array.isArray(panelResponse?.panels) ? panelResponse.panels : [];

  for (const item of responsePanels) {
    const id = String(item?.specialist_id || "");
    const specialist = byId.get(id);
    if (!specialist || used.has(id)) continue;

    const kerne = compactText(item?.kerne, 360);
    const anbefaling = compactText(item?.anbefaling, 420);
    if (!kerne || !anbefaling) continue;

    panels.push({ specialist, kerne, anbefaling });
    used.add(id);
  }

  if (panels.length === 0) return "";

  const lines = ["## Specialistpanel", ""];

  for (const panel of panels) {
    lines.push(
      `### ${displayRoleLabel(panel.specialist, angle)}`,
      `**Kerne:** ${panel.kerne}`,
      `**Anbefaling:** ${panel.anbefaling}`,
      ""
    );
  }

  const heidiSamling = compactText(panelResponse?.heidi_samling, 520);
  if (heidiSamling) {
    lines.push("## Heidis samlede vurdering", heidiSamling, "");
  }

  const startHer = compactText(panelResponse?.start_her, 420);
  if (startHer) {
    lines.push("## Start her", startHer);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function responseUsage(response, phase) {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const totalTokens = Number(response?.usage?.total_tokens || inputTokens + outputTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usageByCall: [
      {
        call: 1,
        phase,
        tools_returned_to_model: [],
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      },
    ],
  };
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usageByCall: [],
  };
}

function buildNoActiveCaseResult({ role, responseStyle }) {
  return {
    handled: true,
    reply: "Jeg har ikke en aktiv case at knytte specialister til lige nu. Beskriv situationen kort, så kan jeg pege på relevante AI-specialistvinkler uden at stille diagnose.",
    model: "local",
    usedTools: ["specialistEngineNoActiveCase"],
    toolDebug: [
      {
        name: "specialistEngineNoActiveCase",
        role,
        response_style: responseStyle,
        token_policy: "0_tokens_local_response",
      },
    ],
    pendingAction: null,
    ...emptyUsage(),
  };
}

export async function runSpecialistEngine({
  openai,
  model = "gpt-5.4-mini",
  message,
  role = "Lærer",
  responseStyle = "Mellem",
  activeLocalCase = null,
  activeCaseContext = null,
  pendingAction = null,
  forceLocalPprAngle = false,
} = {}) {
  const hasCase = Boolean(activeLocalCase || hasActiveCaseContext(activeCaseContext));
  const directRequest = isDirectSpecialistPanelRequest(message);
  const involvedRequest = isCaseSpecialistsInvolvedRequest(message);
  const pprRequest = isLocalPprCaseAngleRequest(message);

  if (!forceLocalPprAngle && !directRequest && !involvedRequest && !pprRequest) {
    return { handled: false };
  }

  if (!hasCase && (directRequest || involvedRequest || pprRequest)) {
    return buildNoActiveCaseResult({ role, responseStyle });
  }

  if (forceLocalPprAngle || (pprRequest && !involvedRequest)) {
    const reply = buildPprAngleReply(activeLocalCase, activeCaseContext);
    return {
      handled: true,
      reply,
      model: "local",
      usedTools: ["specialistEnginePprAngle"],
      toolDebug: [
        {
          name: "specialistEnginePprAngle",
          active_local_case_id: activeLocalCase?.id || null,
          source: activeLocalCase ? "active_local_case" : "active_case_context",
          role,
          response_style: responseStyle,
          token_policy: "0_tokens_local_response",
        },
      ],
      pendingAction: activeLocalCase?.id ? `local_case:${activeLocalCase.id}` : pendingAction || null,
      ...emptyUsage(),
    };
  }

  const angle = involvedRequest ? "case_team" : getRequestedAngle(message);
  const selected = selectSpecialistPanel({
    angle,
    message,
    activeLocalCase,
    activeCaseContext,
  });

  if (selected.length === 0) {
    throw new Error("SpecialistEngine fandt ingen specialister i CDA_SpecialistPanel.json");
  }

  const specialistIds = selected.map((specialist) => String(specialist?.id || "")).filter(Boolean);
  const specialistCaseContextBlock = buildCompactSpecialistCaseContext(activeLocalCase, activeCaseContext);
  const specialistIndexText = buildSpecialistIndexText(selected, angle);

  const panelInstructions = [
    "Du er Heidi i CDA Engine, men dette svar er specialistEngine — ikke almindelig HeidiFlow.",
    "Svar kun, fordi brugeren tydeligt har bedt om specialistperspektiv på den aktive case/sag.",
    "Brug den aktive case/sag som konkret grundlag. Opfind ikke manglende casefelter, specialister eller datakilder.",
    "Brug kun specialisterne i RELEVANT LOKAL SPECIALISTDATA. Du må ikke nævne andre specialister end de leverede ids.",
    "Stil ikke diagnose. Giv ikke medicinråd. Skriv mønstre, støttebehov og næste faglige skridt.",
    "Skriv dansk, lærer-nært og praktisk.",
    "For hver specialist: skriv én kort kerne og én konkret anbefaling, målrettet casen.",
    "Heidis samlede vurdering skal samle specialistvinklerne til én praktisk forståelse uden at gentage alt.",
    "Start her skal være 1-3 handlinger til i morgen eller næste skoleuge.",
    "Brug ikke engelske rollestitler i svaret. Brug ikke specialistens personnavn i brugerens svar; rollen vises af systemet.",
    responseStyle === "Dyb" ? "Svar lidt mere udførligt, men stadig stramt." : "Svar kort og direkte.",
  ].join("\n");

  const panelInput = [
    specialistCaseContextBlock,
    "",
    "BRUGERENS BESKED:",
    message,
    "",
    "RELEVANT LOKAL SPECIALISTDATA:",
    specialistIndexText,
  ].filter((part) => String(part || "").trim()).join("\n");

  const response = await openai.responses.create({
    model,
    reasoning: {
      effort: "low",
    },
    instructions: panelInstructions,
    input: panelInput,
    max_output_tokens:
      responseStyle === "Dyb" ? 950 : responseStyle === "Kort" ? 620 : 780,
    text: {
      format: {
        type: "json_schema",
        name: "cda_specialist_engine_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            panels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  specialist_id: {
                    type: "string",
                    enum: specialistIds,
                  },
                  kerne: {
                    type: "string",
                  },
                  anbefaling: {
                    type: "string",
                  },
                },
                required: ["specialist_id", "kerne", "anbefaling"],
                additionalProperties: false,
              },
            },
            heidi_samling: {
              type: "string",
            },
            start_her: {
              type: "string",
            },
          },
          required: ["panels", "heidi_samling", "start_her"],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra SpecialistEngine");
  }

  const panelResponse = JSON.parse(response.output_text || "{}");
  const reply = formatSpecialistPanelReply({ selected, panelResponse, angle });

  if (!reply) {
    throw new Error("SpecialistEngine returnerede intet brugbart svar");
  }

  const usage = responseUsage(response, involvedRequest ? "specialist_engine_case_team" : "specialist_engine_panel");
  const returnedIds = Array.from(
    new Set(
      (Array.isArray(panelResponse.panels) ? panelResponse.panels : [])
        .map((panel) => String(panel?.specialist_id || ""))
        .filter((id) => specialistIds.includes(id))
    )
  );

  return {
    handled: true,
    reply,
    model,
    usedTools: ["specialistEngineV1"],
    toolDebug: [
      {
        name: "specialistEngineV1",
        action: involvedRequest ? "case_specialists" : "panel",
        requested_angle: angle,
        selected_specialists: returnedIds.map((id) => {
          const specialist = selected.find((item) => String(item?.id || "") === id);
          return {
            id,
            role: specialist ? displayRoleLabel(specialist, angle) : null,
            name: specialist?.name || null,
            group: specialist?.group || null,
            function: specialist?.function || null,
          };
        }),
        active_local_case_id: activeLocalCase?.id || null,
        source: activeLocalCase ? "active_local_case" : "active_case_context",
        role,
        response_style: responseStyle,
      },
    ],
    pendingAction: activeLocalCase?.id ? `local_case:${activeLocalCase.id}` : pendingAction || null,
    ...usage,
  };
}
