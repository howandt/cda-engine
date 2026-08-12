// CDA Engine 24B.2
// SpecialistEngine skeleton / safe helper layer.
//
// IMPORTANT:
// This file must stay side-effect free.
// No imports.
// No API calls.
// No prompt changes.
// No specialist panel execution.
//
// Purpose of this step:
// 1. Introduce the module safely.
// 2. Allow a later import test from api/cda-chat.js.
// 3. Prepare for moving trigger detection in a separate step.

export const SPECIALIST_ENGINE_VERSION = '24B.2-noop';

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
