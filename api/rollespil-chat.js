import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-5.4-mini";
const MAX_HISTORY_ITEMS = 60;
const MAX_HISTORY_CHARS = 40000;
const MAX_MESSAGE_CHARS = 6000;

const VALID_STATUSES = new Set([
  "setup",
  "active",
  "paused",
  "feedback",
  "ended",
]);

const VALID_DIFFICULTIES = new Set(["let", "mellem", "svær"]);

function cleanText(value, maxLength = MAX_MESSAGE_CHARS) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeCommand(value) {
  return cleanText(value, 500)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "aa")
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

function sanitizeState(rawState = {}) {
  const status = VALID_STATUSES.has(rawState.status)
    ? rawState.status
    : "setup";

  const difficulty = VALID_DIFFICULTIES.has(rawState.difficulty)
    ? rawState.difficulty
    : "mellem";

  return {
    session_id: cleanText(rawState.session_id, 100) || createSessionId(),
    status,
    user_role: cleanText(rawState.user_role, 160),
    cda_role: cleanText(rawState.cda_role, 160),
    training_type: cleanText(rawState.training_type, 180),
    difficulty,
    scene: cleanText(rawState.scene, 6000),
    history: sanitizeHistory(rawState.history),
    last_feedback: cleanText(rawState.last_feedback, 6000),
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
          /\bdin\s+rolle\s+er\s+([^,.!?]+)/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1], 160);
  }

  return "";
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

function inferDifficulty(message, fallback = "mellem") {
  const text = normalizeCommand(message);

  if (text.includes("svaer")) return "svær";
  if (text.includes("let")) return "let";
  if (text.includes("mellem")) return "mellem";
  return VALID_DIFFICULTIES.has(fallback) ? fallback : "mellem";
}

function detectAction(message, state, explicitAction) {
  const explicit = normalizeCommand(explicitAction).replace(/\s+/g, "_");
  const allowed = new Set([
    "start",
    "turn",
    "pause",
    "continue",
    "switch_role",
    "feedback",
    "hint",
    "new_scene",
    "stop",
    "reset",
    "help",
  ]);

  if (allowed.has(explicit)) return explicit;

  const text = normalizeCommand(message);
  const wordCount = text ? text.split(" ").length : 0;

  if (!text) return state.status === "active" ? "turn" : "help";

  if (
    text.includes("feedback") ||
    text.includes("debrief") ||
    text.includes("evaluering") ||
    text.includes("vurder min") ||
    text.includes("giv mig en vurdering") ||
    (text.includes("stop") && text.includes("rollespil") && text.includes("raad"))
  ) {
    return "feedback";
  }

  if (
    wordCount <= 8 &&
    (text === "pause" || text === "pause rollespil" || text === "saet paa pause")
  ) {
    return "pause";
  }

  if (
    wordCount <= 8 &&
    (text === "fortsaet" ||
      text === "fortsaet rollespil" ||
      text === "fortsaet hvor vi slap")
  ) {
    return "continue";
  }

  if (
    wordCount <= 12 &&
    (text.includes("skift rolle") || text.includes("byt roller"))
  ) {
    return "switch_role";
  }

  if (wordCount <= 8 && (text === "hint" || text === "tip" || text === "giv et hint")) {
    return "hint";
  }

  if (wordCount <= 10 && (text.includes("ny scene") || text.includes("nyt scenarie"))) {
    return "new_scene";
  }

  if (
    wordCount <= 10 &&
    (text === "stop" ||
      text === "stop rollespil" ||
      text === "slut rollespil" ||
      text === "afslut rollespil")
  ) {
    return "stop";
  }

  if (wordCount <= 6 && (text === "reset" || text === "nulstil" || text === "nulstil rollespil")) {
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

  if (
    state.status === "setup" ||
    state.status === "ended" ||
    (!state.user_role && !state.cda_role)
  ) {
    if (
      text.includes("start rollespil") ||
      text.includes("start rollespilmotor") ||
      text.includes("jeg vil traene") ||
      text.includes("jeg skal traene") ||
      text.includes("du spiller") ||
      text.includes("min rolle er")
    ) {
      return "start";
    }
  }

  return "turn";
}

function buildRoleplayInstructions(state, action) {
  const difficultyInstruction =
    state.difficulty === "let"
      ? "Vær samarbejdende og giv tydelige åbninger, men stadig realistisk."
      : state.difficulty === "svær"
        ? "Giv tydeligt, realistisk modspil. Misforståelser, modstand og følelsesmæssige reaktioner må opstå naturligt, men ikke kunstigt eller teatralsk."
        : "Giv realistisk modspil med en naturlig balance mellem åbenhed og modstand.";

  const commonRules = [
    "Du er den separate CDA-rollespilsmotor.",
    "Dette modul er kun aktivt, fordi brugeren udtrykkeligt har startet eller fortsat et rollespil.",
    "Spil kun den aftalte CDA-rolle. Svar aldrig som brugeren.",
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
    return [
      "Du er nu ude af rollen og giver faglig feedback på det gennemførte rollespil.",
      "Brug kun det konkrete forløb nedenfor. Bland aldrig andre cases eller generelle eksempler ind.",
      "Fasthold, at brugeren spillede sin angivne rolle, og at CDA spillede sin angivne rolle.",
      "Nævn de vigtigste konkrete formuleringer og hændelser fra forløbet.",
      "Beskriv kort: hvad der virkede, hvad der kunne eskalere eller skabe misforståelser, og én bedre formulering eller næste handling.",
      "Ved alvorlige hændelser skal feedbacken afspejle alvoren tydeligt og ikke udglatte den.",
      "Brug ingen pladsholdere som [konkret adfærd]. Skriv den færdige formulering direkte.",
      "Brug ikke point, stjerner eller overdreven ros.",
    ].join("\n");
  }

  if (action === "hint") {
    return [
      "Du er kort ude af rollen og giver ét lille hint.",
      "Hintet skal hjælpe brugeren videre uden at give hele løsningen eller evaluere hele forløbet.",
      "Brug højst 2 korte sætninger.",
    ].join("\n");
  }

  return commonRules.join("\n");
}

function formatHistory(history) {
  if (!history.length) return "(Intet tidligere rollespilsforløb)";

  return history
    .map((item, index) => {
      const speaker = item.role === "user" ? "BRUGERENS ROLLE" : "CDA-ROLLEN";
      return `${index + 1}. ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function buildModelInput(state, action, message) {
  return [
    "AKTUEL ROLLESPILSTILSTAND",
    `Session: ${state.session_id}`,
    `Status: ${state.status}`,
    `Træningsform: ${state.training_type || "generelt rollespil"}`,
    `Brugerens rolle: ${state.user_role}`,
    `CDA's rolle: ${state.cda_role}`,
    `Sværhedsgrad: ${state.difficulty}`,
    "",
    "SCENE OG KENDTE FAKTA",
    state.scene || "Scenen udvikles ud fra brugerens egne oplysninger.",
    "",
    "HELE DET AKTUELLE FORLØB",
    formatHistory(state.history),
    "",
    action === "feedback"
      ? "BRUGERENS ANMODNING OM FEEDBACK"
      : action === "hint"
        ? "BRUGERENS ANMODNING OM ET HINT"
        : "BRUGERENS NYESTE REPLIK",
    message || "Fortsæt naturligt fra det seneste punkt.",
  ].join("\n");
}

async function runModel(state, action, message) {
  const response = await openai.responses.create({
    model: MODEL,
    reasoning: {
      effort: "low",
    },
    instructions: buildRoleplayInstructions(state, action),
    input: buildModelInput(state, action, message),
    max_output_tokens: action === "feedback" ? 700 : action === "hint" ? 180 : 500,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra rollespilsmotoren");
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
    "Rollespilmotoren er klar.",
    "",
    "Skriv fx: ‘Jeg er læreren. Du spiller en skeptisk forælder. Start mødet.’",
    "",
    "Kommandoer: Start rollespil, Pause, Fortsæt, Skift rolle, Ny scene, Hint, Feedback, Stop rollespil og Reset.",
    "",
    "Under scenen bliver CDA i den valgte rolle. Feedback gives først, når du beder om den.",
  ].join("\n");
}

function appendRoleplayTurn(state, userMessage, assistantReply) {
  state.history = sanitizeHistory([
    ...state.history,
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantReply },
  ]);
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
      success: false,
      error: "Method not allowed",
      allowed_methods: ["POST"],
    });
  }

  try {
    const body = req.body || {};
    const message = cleanText(body.message);
    let state = sanitizeState(body.state || {});
    const action = detectAction(message, state, body.action);

    if (action === "reset") {
      return res.status(200).json({
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

      return res.status(200).json({
        success: true,
        reply: roleplayHelpReply(),
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "start") {
      state = sanitizeState({
        session_id: createSessionId(),
        status: "setup",
        user_role:
          cleanText(body.user_role, 160) || extractRole(message, "user"),
        cda_role:
          cleanText(body.cda_role, 160) || extractRole(message, "cda"),
        training_type: cleanText(body.training_type, 180),
        difficulty: inferDifficulty(
          message,
          cleanText(body.difficulty, 20) || "mellem"
        ),
        scene: cleanText(body.scene, 6000) || message,
        history: [],
      });

      if (!state.user_role || !state.cda_role) {
        const missingQuestion = !state.user_role && !state.cda_role
          ? "Hvilken rolle vil du selv have, og hvilken rolle skal jeg spille?"
          : !state.user_role
            ? "Hvilken rolle vil du selv have i træningen?"
            : "Hvilken rolle skal jeg spille?";

        return res.status(200).json({
          success: true,
          reply: `${roleplayHelpReply()}\n\n${missingQuestion}`,
          action,
          model: null,
          usage: null,
          state,
        });
      }

      state.training_type =
        state.training_type ||
        inferTrainingType(message, state.user_role, state.cda_role);
      state.status = "active";

      const result = await runModel(state, action, message);
      appendRoleplayTurn(state, message, result.reply);

      return res.status(200).json({
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
        return res.status(409).json({
          success: false,
          error: "Der er ikke et aktivt rollespil at sætte på pause",
          state,
        });
      }

      state.status = "paused";
      return res.status(200).json({
        success: true,
        reply: "Rollespillet er sat på pause.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "continue") {
      if (!["paused", "feedback"].includes(state.status)) {
        return res.status(409).json({
          success: false,
          error: "Der er ikke et pauset rollespil at fortsætte",
          state,
        });
      }

      state.status = "active";
      return res.status(200).json({
        success: true,
        reply: `Rollespillet fortsætter. Du er ${state.user_role}, og jeg er ${state.cda_role}. Din tur.`,
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "switch_role") {
      if (!state.user_role || !state.cda_role) {
        return res.status(409).json({
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

      state.status = "active";
      return res.status(200).json({
        success: true,
        reply: `Rollerne er skiftet. Du er nu ${state.user_role}, og jeg spiller ${state.cda_role}.`,
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "new_scene") {
      state.status = "setup";
      state.scene = cleanText(body.scene, 6000) || message;
      state.history = [];
      state.last_feedback = "";

      return res.status(200).json({
        success: true,
        reply: "Den tidligere scene er afsluttet. Beskriv den nye scene, eller skriv rollerne og startreplikken.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "stop") {
      state.status = "ended";
      return res.status(200).json({
        success: true,
        reply: "Rollespillet er afsluttet.",
        action,
        model: null,
        usage: null,
        state,
      });
    }

    if (action === "feedback" || action === "hint") {
      if (!state.user_role || !state.cda_role || state.history.length === 0) {
        return res.status(409).json({
          success: false,
          error: "Der er ikke et gennemført rollespilsforløb at vurdere",
          state,
        });
      }

      const result = await runModel(state, action, message);

      if (action === "feedback") {
        state.status = "feedback";
        state.last_feedback = result.reply;
      }

      return res.status(200).json({
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
        return res.status(409).json({
          success: false,
          error: "Rollespillet er på pause. Skriv ‘Fortsæt’ først.",
          state,
        });
      }

      if (state.status !== "active") {
        return res.status(409).json({
          success: false,
          error: "Rollespillet er ikke aktivt. Start rollespillet først.",
          state,
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          error: "Beskeden er tom",
          state,
        });
      }

      const result = await runModel(state, action, message);
      appendRoleplayTurn(state, message, result.reply);

      return res.status(200).json({
        success: true,
        reply: result.reply,
        action,
        model: MODEL,
        usage: result.usage,
        state,
      });
    }

    return res.status(400).json({
      success: false,
      error: `Ukendt rollespilshandling: ${action}`,
      state,
    });
  } catch (error) {
    console.error("CDA rollespil-chatfejl:", error);

    return res.status(500).json({
      success: false,
      error: "Rollespilsmotoren kunne ikke behandle beskeden",
      details: error.message,
    });
  }
}
