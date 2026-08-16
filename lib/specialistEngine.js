// CDA Engine 24B.13
// SpecialistEngine: hidden secondary specialist router / side-effect-free layer.
//
// IMPORTANT:
// This file must stay side-effect free.
// No imports.
// No API calls.
// No prompt changes.
// No specialist panel execution.
// No static specialist assessments.
//
// Purpose:
// 1. Keep specialist trigger detection outside api/cda-chat.js.
// 2. Preserve Heidi as CDA's dynamic main voice.
// 3. Keep the specialist panel hidden and secondary unless clearly called.
// 4. Select specialist candidates dynamically from local CDA specialist data only.

export const SPECIALIST_ENGINE_VERSION = '24B.13-hidden-secondary-router';

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
  'tværfaglig vurdering',
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
  'hvilke specialister har været inde over',
  'hvilke specialister har set pa',
  'hvilke specialister har set på',
  'hvilke specialister har vaeret involveret',
  'hvilke specialister har været involveret',
  'hvilke specialister er relevante for denne case',
  'hvilke specialister er relevante for denne sag',
  'hvem har kigget pa denne case',
  'hvem har kigget på denne case',
  'hvem har kigget pa denne sag',
  'hvem har kigget på denne sag',
  'specialister involveret i denne sag',
  'specialister involveret i denne case',
  'hvilket specialistteam',
];

const ANGLE_PATTERNS = {
  psychologist: [
    'psykolog',
    'psykologisk',
    'psykologi',
    'skolepsykolog',
  ],
  ppr: [
    'ppr',
    'skolepsykolog',
    'raadgivning',
    'rådgivning',
    'observation',
    'indstilling',
  ],
};

const DEFAULT_SPECIALIST_PANEL_EXCLUDED_IDS = new Set([
  'ai_child_psychiatrist_elias_strand',
  'ai_crisis_specialist_anna_rydell',
]);

export function isDirectSpecialistPanelRequestFromEngine(message) {
  return includesSpecialistPattern(message, DIRECT_SPECIALIST_PANEL_PATTERNS);
}

export function isCaseSpecialistsInvolvedRequestFromEngine(message) {
  return includesSpecialistPattern(message, CASE_SPECIALISTS_INVOLVED_PATTERNS);
}

export function detectSpecialistAngleFromEngine(message, specialists = []) {
  const text = normalizeSpecialistPhrase(message);

  const namedSpecialist = findNamedSpecialistFromEngine(message, specialists);
  if (namedSpecialist) {
    return 'named';
  }

  if (isCaseSpecialistsInvolvedRequestFromEngine(message)) {
    return 'case_team';
  }

  if (text.includes('ppr')) {
    return 'ppr';
  }

  if (text.includes('psykolog')) {
    return 'psychologist';
  }

  if (isDirectSpecialistPanelRequestFromEngine(message)) {
    return 'specialists';
  }

  return 'none';
}

export function findNamedSpecialistFromEngine(message, specialists = []) {
  const text = normalizeSpecialistPhrase(message);

  if (!text || !Array.isArray(specialists)) {
    return null;
  }

  const withPersonalName = specialists
    .map((specialist) => {
      const fullName = String(specialist?.name || '').trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const personalName = parts.slice(-2).join(' ');
      const lastName = parts.slice(-1).join(' ');
      return { specialist, personalName, lastName };
    })
    .filter((item) => item.personalName);

  const fullNameMatch = withPersonalName.find((item) => {
    const normalizedName = normalizeSpecialistPhrase(item.personalName);
    return normalizedName.length > 0 && text.includes(normalizedName);
  });

  if (fullNameMatch) {
    return fullNameMatch.specialist;
  }

  const lastNameMatches = withPersonalName.filter((item) => {
    const normalizedLastName = normalizeSpecialistPhrase(item.lastName);
    return normalizedLastName.length >= 4 && text.includes(normalizedLastName);
  });

  if (lastNameMatches.length === 1) {
    return lastNameMatches[0].specialist;
  }

  return null;
}

export function isExcludedFromDefaultSpecialistPanelFromEngine(specialist) {
  const id = String(specialist?.id || '').trim();
  return DEFAULT_SPECIALIST_PANEL_EXCLUDED_IDS.has(id);
}

function specialistKeywords(specialist) {
  return Array.isArray(specialist?.keywords)
    ? specialist.keywords
        .map((keyword) => normalizeSpecialistPhrase(keyword))
        .filter(Boolean)
    : [];
}

function keywordMatchesText(keyword, text) {
  if (!keyword || !text) {
    return false;
  }

  return ` ${text} `.includes(` ${keyword} `);
}

function scoreSpecialistFromEngine(specialist, angle, searchableText) {
  const keywords = specialistKeywords(specialist);
  let score = 0;

  for (const pattern of ANGLE_PATTERNS[angle] || []) {
    const normalizedPattern = normalizeSpecialistPhrase(pattern);
    if (keywords.some((keyword) => keyword === normalizedPattern)) {
      score += 40;
    }
  }

  for (const keyword of keywords) {
    if (keyword.length >= 4 && keywordMatchesText(keyword, searchableText)) {
      score += keyword.includes(' ') ? 16 : 10;
    }
  }

  return score;
}

function cleanSpecialistValue(value, max = 160) {
  const text = String(value || '')
    .replace(/[|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max).trim()}…`;
}

function buildSpecialistIndexText(specialists) {
  const rows = specialists.map((specialist) => {
    const keywords = Array.isArray(specialist?.keywords)
      ? specialist.keywords.slice(0, 8).join(', ')
      : '';

    return [
      cleanSpecialistValue(specialist?.id, 80),
      cleanSpecialistValue(specialist?.name, 120),
      cleanSpecialistValue(specialist?.group, 120),
      cleanSpecialistValue(specialist?.function, 220),
      cleanSpecialistValue(keywords, 180),
    ].join('|');
  });

  return [
    'KOLONNER:id|navn|gruppe|funktion|keywords',
    ...rows,
  ].join('\n');
}

function summarizeSpecialists(specialists) {
  return specialists
    .map((specialist) => ({
      id: String(specialist?.id || ''),
      name: String(specialist?.name || ''),
      group: String(specialist?.group || ''),
      function: String(specialist?.function || ''),
    }))
    .filter((specialist) => specialist.id);
}

export function routeSpecialistRequestFromEngine({
  message = '',
  activeCaseText = '',
  specialists = [],
} = {}) {
  const safeSpecialists = Array.isArray(specialists) ? specialists : [];
  const angle = detectSpecialistAngleFromEngine(message, safeSpecialists);
  const specialistRequested = angle !== 'none';

  if (!specialistRequested) {
    return {
      specialist_requested: false,
      angle: 'none',
      confidence: 'not_requested',
      specialistIds: [],
      specialistSummaries: [],
      indexText: '',
    };
  }

  const namedSpecialist =
    angle === 'named'
      ? findNamedSpecialistFromEngine(message, safeSpecialists)
      : null;

  if (namedSpecialist) {
    return {
      specialist_requested: true,
      angle,
      confidence: 'safe',
      specialistIds: [String(namedSpecialist?.id || '')].filter(Boolean),
      specialistSummaries: summarizeSpecialists([namedSpecialist]),
      indexText: buildSpecialistIndexText([namedSpecialist]),
    };
  }

  const candidateSpecialists =
    angle === 'specialists' || angle === 'case_team'
      ? safeSpecialists.filter(
          (specialist) => !isExcludedFromDefaultSpecialistPanelFromEngine(specialist)
        )
      : safeSpecialists;

  const searchableText = normalizeSpecialistPhrase(`${message} ${activeCaseText}`);
  const maxCount = angle === 'case_team' ? 5 : angle === 'specialists' ? 3 : 1;

  const selected = candidateSpecialists
    .map((specialist, index) => ({
      specialist,
      score: scoreSpecialistFromEngine(specialist, angle, searchableText),
      index,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxCount)
    .map((item) => item.specialist);

  if (selected.length === 0) {
    return {
      specialist_requested: true,
      angle,
      confidence: 'no_match',
      specialistIds: [],
      specialistSummaries: [],
      indexText: '',
    };
  }

  return {
    specialist_requested: true,
    angle,
    confidence: 'safe',
    specialistIds: selected
      .map((specialist) => String(specialist?.id || ''))
      .filter(Boolean),
    specialistSummaries: summarizeSpecialists(selected),
    indexText: buildSpecialistIndexText(selected),
  };
}
