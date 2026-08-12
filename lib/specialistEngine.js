// CDA Engine 24B.4
// SpecialistEngine trigger-detection layer.
//
// IMPORTANT:
// This file must stay side-effect free.
// No fs/path imports.
// No API calls.
// No OpenAI calls.
// No specialist panel execution.
//
// Purpose of this step:
// 1. Move pure specialist trigger detection into lib/specialistEngine.js.
// 2. Keep api/cda-chat.js call sites stable through local wrapper functions.
// 3. Leave named-specialist lookup and panel execution in api/cda-chat.js for later micro-steps.

export const SPECIALIST_ENGINE_VERSION = '24B.4-trigger-detection';

export function specialistEngineHealthcheck() {
  return true;
}

export function normalizeSpecialistInput(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function hasSpecialistInput(value) {
  return normalizeSpecialistInput(value).length > 0;
}

export function normalizeSpecialistPhrase(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/ã¦/g, 'ae')
    .replace(/ã¸/g, 'o')
    .replace(/ã¥/g, 'a')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¥/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesSpecialistPattern(message, patterns = []) {
  const text = normalizeSpecialistPhrase(message);

  if (!text) {
    return false;
  }

  return patterns.some((pattern) =>
    text.includes(normalizeSpecialistPhrase(pattern))
  );
}

export function isDirectSpecialistPanelRequestFromEngine(message) {
  const directPatterns = [
    'specialistpanel',
    'specialist panel',
    'hvad siger specialisterne',
    'specialistperspektiv',
    'tvaerfaglig vurdering',
    'hvad siger psykologen',
    'psykologens vinkel',
    'psykologvinkel',
    'hvad ville psykologen sige',
    'hvad siger ppr',
    'ppr vinkel',
    'ppr-vinkel',
  ];

  return includesSpecialistPattern(message, directPatterns);
}

export function isCaseSpecialistsInvolvedRequestFromEngine(message) {
  const directPatterns = [
    'hvilke specialister har vaeret inde over',
    'hvilke specialister har set pa',
    'hvilke specialister har vaeret involveret',
    'hvilke specialister er relevante for denne case',
    'hvilke specialister er relevante for denne sag',
    'hvem har kigget pa denne case',
    'hvem har kigget pa denne sag',
    'specialister involveret i denne sag',
    'specialister involveret i denne case',
    'hvilket specialistteam',
  ];

  return includesSpecialistPattern(message, directPatterns);
}
