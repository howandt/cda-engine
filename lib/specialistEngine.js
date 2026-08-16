// CDA Engine 24B.5
// SpecialistEngine trigger helpers / side-effect-free layer.
//
// IMPORTANT:
// This file must stay side-effect free.
// No imports.
// No API calls.
// No prompt changes.
// No specialist panel execution.
// No static specialist assessments.
//
// Purpose of this step:
// 1. Keep specialist trigger detection outside api/cda-chat.js.
// 2. Preserve specialist panel as secondary and only activated by clear user call.
// 3. Prepare a later safe import step from api/cda-chat.js.

export const SPECIALIST_ENGINE_VERSION = '24B.5-trigger-helpers';

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

const DIRECT_SPECIALIST_PANEL_PATTERNS = [
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

const CASE_SPECIALISTS_INVOLVED_PATTERNS = [
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

export function isDirectSpecialistPanelRequestFromEngine(message) {
  return includesSpecialistPattern(message, DIRECT_SPECIALIST_PANEL_PATTERNS);
}

export function isCaseSpecialistsInvolvedRequestFromEngine(message) {
  return includesSpecialistPattern(message, CASE_SPECIALISTS_INVOLVED_PATTERNS);
}
