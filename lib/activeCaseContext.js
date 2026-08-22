// Aktiv-sags-kontekst.
//
// Renser og formaterer den "aktive sag"-hukommelse, som chat.html
// sender med mellem beskeder, saa samme barn/situation kan holdes
// aaben paa tvaers af flere beskeder i samme samtale.

import { normalizeReplyIntent } from "./replyIntent.js";

function compactContextValue(value, maxLength = 900) {
  if (value === null || value === undefined) return "";

  const text = Array.isArray(value)
    ? value.map((item) => compactContextValue(item, maxLength)).filter(Boolean).join("; ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeUsedDataSources(value) {
  if (!value) return [];

  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "object"
      ? Object.entries(value).map(([key, item]) => ({ key, item }))
      : [value];

  return rawItems
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        return compactContextValue(item, 160);
      }

      if (typeof item === "object") {
        const type = compactContextValue(item.type || item.source || item.key || "data", 60);
        const id = compactContextValue(item.id || item.name || item.item || item.file || item.primary || "", 120);
        const status = compactContextValue(item.status || item.note || "", 120);
        return [type, id, status].filter(Boolean).join(": ");
      }

      return compactContextValue(item, 160);
    })
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeActiveCaseContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = compactContextValue(
    value.summary || value.active_case_summary || value.case_summary || "",
    1100
  );

  const lastUserMessage = compactContextValue(
    value.last_user_message || value.lastUserMessage || "",
    700
  );

  const lastHeidiReply = compactContextValue(
    value.last_heidi_reply || value.lastHeidiReply || value.last_assistant_reply || "",
    900
  );

  const knownContext = compactContextValue(
    value.known_context || value.knownContext || "",
    900
  );

  const lastGuidanceSummary = compactContextValue(
    value.last_guidance_summary || value.lastGuidanceSummary || "",
    900
  );

  const openQuestionOrNextStep = compactContextValue(
    value.open_question_or_next_step || value.next_step || value.openQuestionOrNextStep || "",
    450
  );

  const conversationMode = compactContextValue(
    value.conversation_mode || value.mode || "heidi_case",
    80
  ) || "heidi_case";

  const usedDataSources = normalizeUsedDataSources(
    value.used_data_sources || value.usedDataSources || []
  );

  if (
    !summary &&
    !lastUserMessage &&
    !lastHeidiReply &&
    !knownContext &&
    !lastGuidanceSummary &&
    usedDataSources.length === 0
  ) {
    return null;
  }

  return {
    active: value.active !== false,
    conversation_mode: conversationMode,
    summary,
    known_context: knownContext,
    last_user_message: lastUserMessage,
    last_heidi_reply: lastHeidiReply,
    last_guidance_summary: lastGuidanceSummary,
    used_data_sources: usedDataSources,
    open_question_or_next_step: openQuestionOrNextStep,
  };
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

function isShortContinuationRequest(message) {
  const text = normalizeReplyIntent(message);

  const exactContinuations = [
    "uddyb",
    "forklar mere",
    "mere",
    "gør det dybere",
    "gor det dybere",
    "skriv samme svar længere",
    "skriv samme svar laengere",
    "hvorfor",
    "hvorfor virker det",
    "hvad mener du",
    "det virkede ikke",
    "det virker ikke",
    "hvad nu",
    "hvad gør jeg så",
    "hvad gor jeg sa",
    "fortsæt",
    "fortsaet",
  ];

  if (exactContinuations.includes(text)) return true;

  return text.length <= 80 && [
    "uddyb",
    "forklar",
    "samme sag",
    "det virkede ikke",
    "det virker ikke",
    "hvad nu",
  ].some((pattern) => text.includes(pattern));
}

function buildActiveCaseContextBlock(context) {
  if (!hasActiveCaseContext(context)) return "";

  const lines = [
    "AKTIV HEIDI-SAG",
    "Denne kontekst kommer fra samme igangværende samtale. Brug den kun som arbejdshukommelse, ikke som journal eller endelig konklusion.",
    `conversation_mode: ${context.conversation_mode}`,
  ];

  if (context.summary) lines.push(`active_case_summary: ${context.summary}`);
  if (context.known_context) lines.push(`known_context: ${context.known_context}`);
  if (context.last_user_message) lines.push(`last_user_message: ${context.last_user_message}`);
  if (context.last_heidi_reply) lines.push(`last_heidi_reply: ${context.last_heidi_reply}`);
  if (context.last_guidance_summary) lines.push(`last_guidance_summary: ${context.last_guidance_summary}`);
  if (context.used_data_sources.length > 0) {
    lines.push(`used_data_sources: ${context.used_data_sources.join(" | ")}`);
  }
  if (context.open_question_or_next_step) {
    lines.push(`open_question_or_next_step: ${context.open_question_or_next_step}`);
  }

  return lines.join("\n");
}

function buildActiveCaseInstructions(context, message) {
  if (!hasActiveCaseContext(context)) return "";

  const continuation = isShortContinuationRequest(message);

  return [
    "AKTIV SAGSHUKOMMELSE",
    "Brug active_case_context til at holde samme barn/situation åben på tværs af beskeder.",
    "Korte opfølgninger som 'uddyb', 'forklar mere', 'hvad nu' eller 'det virkede ikke' handler som udgangspunkt om samme aktive sag.",
    "Hvis brugeren spørger 'hvad siger psykologen?', 'hvad siger PPR?' eller lignende, skal du give en faglig specialistvinkel på samme aktive sag — ikke bede om en ekstern psykolograpport, medmindre brugeren specifikt henviser til en konkret rapport.",
    "Gentag ikke lokale dataopslag, hvis used_data_sources allerede viser, at samme spor er dækket, medmindre brugerens nye besked åbner et reelt nyt fagligt spor.",
    "Ved 'uddyb' skal du uddybe samme sag og samme råd, ikke spørge hvad der skal uddybes.",
    continuation ? "DEN NYE BESKED ER EN FORTSÆTTELSE AF SAMME SAG." : "",
  ].filter(Boolean).join("\n");
}

function buildContextualInput(message, context) {
  const contextBlock = buildActiveCaseContextBlock(context);

  if (!contextBlock) return message;

  return [
    contextBlock,
    "",
    "BRUGERENS NYE BESKED:",
    message,
  ].join("\n");
}


export {
  sanitizeActiveCaseContext,
  hasActiveCaseContext,
  buildActiveCaseInstructions,
  buildContextualInput,
};
