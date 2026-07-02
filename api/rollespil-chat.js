import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-5.4-mini";
const MAX_HISTORY_ITEMS = 60;
const MAX_HISTORY_CHARS = 40000;
const MAX_MESSAGE_CHARS = 6000;
const MAX_ROLE_EVENTS = 20;

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

  return {
    session_id: cleanText(rawState.session_id, 100) || createSessionId(),
    status,
    user_role: userRole,
    cda_role: cdaRole,
    training_type: cleanText(rawState.training_type, 180),
    difficulty,
    scene: cleanText(rawState.scene, 6000),
    history,
    role_events: sanitizeRoleEvents(
      rawState.role_events,
      history.length,
      userRole,
      cdaRole
    ),
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

  const isShortCommand = wordCount <= 12;

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

  if (
    state.status === "setup" ||
    state.status === "ended" ||
    (!state.user_role && !state.cda_role)
  ) {
    if (
      text.includes("start rollespil") ||
      text.includes("start rollespillet") ||
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
    return [
      "Du er nu ude af rollen og giver faglig feedback på det gennemførte rollespil.",
      `Brugeren spiller aktuelt ${state.user_role}. CDA spiller modparten ${state.cda_role}.`,
      `Vurdér og hjælp kun brugerens kommunikation og handlinger som ${state.user_role}. Giv ikke brugeren råd som ${state.cda_role}.`,
      "Brug kun det konkrete forløb nedenfor. Bland aldrig andre cases eller generelle eksempler ind.",
      "Fasthold rolleperioderne før og efter eventuelle rolleskift.",
      "Nævn de vigtigste konkrete formuleringer og hændelser fra forløbet.",
      "Beskriv kort: hvad der virkede, hvad der kunne eskalere eller skabe misforståelser, og én bedre formulering eller næste handling.",
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

function buildModelInput(state, action, message) {
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
    state.scene || "Scenen udvikles ud fra brugerens egne oplysninger.",
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
        role_events: [],
      });

      state.role_events = [
        {
          history_index: 0,
          user_role: state.user_role,
          cda_role: state.cda_role,
        },
      ];

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
      const newUserRole =
        cleanText(body.user_role, 160) || extractRole(message, "user");
      const newCdaRole =
        cleanText(body.cda_role, 160) || extractRole(message, "cda");
      const newScene = cleanText(body.scene, 6000) || message;

      state = sanitizeState({
        session_id: state.session_id || createSessionId(),
        status: "setup",
        user_role: newUserRole,
        cda_role: newCdaRole,
        training_type:
          cleanText(body.training_type, 180) ||
          inferTrainingType(message, newUserRole, newCdaRole),
        difficulty: inferDifficulty(
          message,
          cleanText(body.difficulty, 20) || state.difficulty || "mellem"
        ),
        scene: newScene,
        history: [],
        role_events: [],
        last_feedback: "",
      });

      if (!state.user_role || !state.cda_role) {
        const missingQuestion = !state.user_role && !state.cda_role
          ? "Hvilken rolle vil du selv have, og hvilken rolle skal jeg spille i den nye scene?"
          : !state.user_role
            ? "Hvilken rolle vil du selv have i den nye scene?"
            : "Hvilken rolle skal jeg spille i den nye scene?";

        return res.status(200).json({
          success: true,
          reply: missingQuestion,
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
