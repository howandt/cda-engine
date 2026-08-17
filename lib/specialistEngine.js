// CDA Engine 24B.18B
// SpecialistEngine hidden secondary router / side-effect-free specialist layer.
//
// IMPORTANT:
// This file must stay side-effect free.
// No imports.
// No API calls.
// No prompt changes.
// No static specialist assessments.
// No specialist panel execution.
//
// Purpose of this step:
// 1. Move specialist trigger and angle selection out of api/cda-chat.js.
// 2. Keep specialist panel as secondary and only activated by clear user call.
// 3. Preserve dynamic specialist selection from local CDA specialist data.
// 4. Prepare later safe cda-chat.js slimming step without adding new specialist logic there.

export const SPECIALIST_ENGINE_VERSION = '24B.18B-case-signal-specialist-match';

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

function formatSpecialistValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function limitSpecialistTextFromEngine(value, max = 260) {
  const text = formatSpecialistValue(value)
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max).trim()}…`;
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

export function findNamedSpecialistInMessageFromEngine(message, specialists = []) {
  const list = Array.isArray(specialists) ? specialists : [];
  const text = normalizeSpecialistPhrase(message);

  if (!text || list.length === 0) {
    return null;
  }

  const withPersonalName = list
    .map((specialist) => {
      const fullName = String(specialist?.name || '').trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const personalName = parts.slice(-2).join(' ');
      const lastName = parts.slice(-1).join(' ');
      return { specialist, personalName, lastName };
    })
    .filter((item) => item.personalName);

  const fullNameMatch = withPersonalName.find(
    (item) =>
      normalizeSpecialistPhrase(item.personalName).length > 0 &&
      text.includes(normalizeSpecialistPhrase(item.personalName))
  );

  if (fullNameMatch) {
    return fullNameMatch.specialist;
  }

  const lastNameMatches = withPersonalName.filter(
    (item) =>
      item.lastName.length >= 4 &&
      text.includes(normalizeSpecialistPhrase(item.lastName))
  );

  if (lastNameMatches.length === 1) {
    return lastNameMatches[0].specialist;
  }

  return null;
}

export function isDirectSpecialistPanelRequestFromEngine(message, specialists = []) {
  if (includesSpecialistPattern(message, DIRECT_SPECIALIST_PANEL_PATTERNS)) {
    return true;
  }

  return Boolean(findNamedSpecialistInMessageFromEngine(message, specialists));
}

export function isCaseSpecialistsInvolvedRequestFromEngine(message) {
  return includesSpecialistPattern(message, CASE_SPECIALISTS_INVOLVED_PATTERNS);
}

export function getRequestedSpecialistAngleFromEngine(message, specialists = []) {
  const text = normalizeSpecialistPhrase(message);

  if (findNamedSpecialistInMessageFromEngine(message, specialists)) {
    return 'named';
  }

  if (text.includes('psykolog')) {
    return 'psychologist';
  }

  if (text.includes('ppr')) {
    return 'ppr';
  }

  return 'specialists';
}

const DEFAULT_SPECIALIST_PANEL_EXCLUDED_IDS = new Set([
  'ai_child_psychiatrist_elias_strand',
  'ai_crisis_specialist_anna_rydell',
]);

export function isExcludedFromDefaultSpecialistPanelFromEngine(specialist) {
  const id = String(specialist?.id || '').trim();
  return DEFAULT_SPECIALIST_PANEL_EXCLUDED_IDS.has(id);
}

export function buildSingleSpecialistPanelFromEngine(specialist) {
  if (!specialist) {
    return { specialistIds: [], specialistSummaries: [], indexText: '' };
  }

  const cleanValue = (value, max = 160) =>
    limitSpecialistTextFromEngine(value, max)
      .replace(/[|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const keywords = Array.isArray(specialist?.keywords)
    ? specialist.keywords.slice(0, 8).join(', ')
    : '';

  const row = [
    cleanValue(specialist?.id, 80),
    cleanValue(specialist?.name, 120),
    cleanValue(specialist?.group, 120),
    cleanValue(specialist?.function, 220),
    cleanValue(keywords, 180),
  ].join('|');

  return {
    specialistIds: [String(specialist?.id || '')].filter(Boolean),
    specialistSummaries: [
      {
        id: String(specialist?.id || ''),
        name: String(specialist?.name || ''),
        group: String(specialist?.group || ''),
        function: String(specialist?.function || ''),
      },
    ].filter((item) => item.id),
    indexText: ['KOLONNER:id|navn|gruppe|funktion|keywords', row].join('\n'),
  };
}

export function buildCompactSpecialistCaseContextFromEngine(caseData, activeContext) {
  if (caseData) {
    const lines = [
      'AKTIV CASE — KORT GRUNDLAG',
      `id: ${limitSpecialistTextFromEngine(caseData.id, 80) || '-'}`,
      `titel: ${limitSpecialistTextFromEngine(caseData.titel || caseData.title, 120) || '-'}`,
    ];

    const fields = [
      ['alder', caseData.alder || caseData.age, 40],
      ['diagnose/spor', caseData.diagnoser || caseData.diagnoses || caseData.relevante_diagnoser, 120],
      ['tema', caseData.tema || caseData.theme || caseData.kategori, 160],
      ['problem', caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse, 360],
      ['barnets oplevelse', caseData.barnets_oplevelse || caseData.barnets_perspektiv || caseData.childVoice, 220],
      ['typisk fejl', caseData.typisk_fejl || caseData.mistakes, 220],
      ['løsning', caseData.løsning || caseData.loesning || caseData.solution, 300],
      ['tiltag', caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer || caseData.tools, 300],
    ];

    for (const [label, value, max] of fields) {
      const text = limitSpecialistTextFromEngine(value, max);
      if (text) {
        lines.push(`${label}: ${text}`);
      }
    }

    return lines.join('\n');
  }

  if (activeContext?.summary || activeContext?.known_context || activeContext?.last_user_message) {
    return [
      'AKTIV SAG — KORT GRUNDLAG',
      activeContext.summary ? `sag: ${limitSpecialistTextFromEngine(activeContext.summary, 420)}` : '',
      activeContext.known_context ? `kontekst: ${limitSpecialistTextFromEngine(activeContext.known_context, 220)}` : '',
      activeContext.last_user_message ? `sidste brugerbesked: ${limitSpecialistTextFromEngine(activeContext.last_user_message, 260)}` : '',
      activeContext.last_guidance_summary ? `seneste råd: ${limitSpecialistTextFromEngine(activeContext.last_guidance_summary, 260)}` : '',
    ].filter(Boolean).join('\n');
  }

  return '';
}


const SPECIALIST_FIELD_STOP_WORDS = new Set([
  'specialist',
  'specialister',
  'raadgivning',
  'rådgivning',
  'vejledning',
  'baseret',
]);

function uniqueSpecialistTerms(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = normalizeSpecialistPhrase(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function specialistFieldTerms(value) {
  const normalized = normalizeSpecialistPhrase(value);

  if (!normalized) {
    return [];
  }

  const phraseParts = String(value || '')
    .split(/[,;|/()]+/g)
    .map((part) => normalizeSpecialistPhrase(part))
    .filter((part) => part.length >= 4);

  const wordParts = normalized
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 4 &&
        !SPECIALIST_FIELD_STOP_WORDS.has(word)
    );

  return uniqueSpecialistTerms([normalized, ...phraseParts, ...wordParts]);
}

const SPECIALIST_CASE_SIGNAL_RULES = [
  {
    patterns: [
      'taler hjemme',
      'tavs i bornehaven',
      'tavs i børnehaven',
      'helt tavs',
      'siger ikke noget',
      'vil ikke tale',
      'nonverbal',
      'peger',
      'kropssprog',
      'selektiv mutisme',
      'mutisme',
    ],
    signals: [
      'kommunikation',
      'social kommunikation',
      'taleadfaerd',
      'taleadfærd',
      'kropssprog',
      'sprogudvikling',
    ],
  },
  {
    patterns: [
      'aflevering',
      'afleveret',
      'foraelder gar',
      'forælder går',
      'venter pa foraelder',
      'venter på forælder',
      'savner mor',
      'savner far',
      'savner sin kat',
      'mor',
      'far',
      'hjem',
      'hentes',
      'hentet',
    ],
    signals: [
      'angst',
      'stress',
      'familie',
      'foraeldre',
      'forældre',
      'relationer',
      'kommunikation',
    ],
  },
  {
    patterns: [
      'overgang',
      'overgange',
      'skift',
      'omstill',
      'morgen',
      'rutine',
      'fast ritual',
      'forudsigelig',
      'star ved doren',
      'står ved døren',
    ],
    signals: [
      'struktur',
      'daglig rutine',
      'hverdagstilpasning',
      'stress',
      'regulering',
    ],
  },
  {
    patterns: [
      'utryg',
      'tryghed',
      'las',
      'låst',
      'fastlast',
      'fastlåst',
      'fryser',
      'pres',
      'direkte sporgsmal',
      'direkte spørgsmål',
      'bliver vred',
      'ked af det',
    ],
    signals: [
      'angst',
      'stress',
      'regulering',
      'relationer',
      'terapi',
    ],
  },
  {
    patterns: [
      'fantasiven',
      'fantasivenner',
      'indre ven',
      'indre venner',
      'elias',
      'peter',
      'kat',
      'ikke til stede',
      'leger alene',
    ],
    signals: [
      'social kommunikation',
      'relationer',
      'regulering',
      'kropssprog',
      'kommunikation',
    ],
  },
  {
    patterns: [
      'uro',
      'urolig',
      'rastlos',
      'rastløs',
      'forstyrrer',
      'impulsiv',
      'kan ikke slippe',
      'konflikt',
      'driller',
      'grimme navne',
    ],
    signals: [
      'adhd',
      'fokus',
      'struktur',
      'funktionel analyse',
      'adfaerdsfunktion',
      'adfærdsfunktion',
      'konflikter',
      'relationer',
      'regulering',
    ],
  },
  {
    patterns: [
      'overstimulering',
      'sanse',
      'sensorisk',
      'stoj',
      'støj',
      'meltdown',
      'kropslig uro',
    ],
    signals: [
      'sensorik',
      'sensorisk belastning',
      'sanseintegration',
      'overstimulering',
      'sensorisk profil',
    ],
  },
];

function extractSpecialistCaseSignals(text) {
  const normalizedText = normalizeSpecialistPhrase(text);

  if (!normalizedText) {
    return [];
  }

  const signals = [];

  for (const rule of SPECIALIST_CASE_SIGNAL_RULES) {
    const hasPattern = rule.patterns.some((pattern) => {
      const normalizedPattern = normalizeSpecialistPhrase(pattern);
      return normalizedPattern && normalizedText.includes(normalizedPattern);
    });

    if (hasPattern) {
      signals.push(...rule.signals);
    }
  }

  return uniqueSpecialistTerms(signals);
}

function specialistTextIncludes(text, term) {
  const normalizedTerm = normalizeSpecialistPhrase(term);

  if (!text || !normalizedTerm || normalizedTerm.length < 4) {
    return false;
  }

  return text.includes(normalizedTerm);
}

export function buildSpecialistSelectionContextFromEngine(caseData, activeContext) {
  const parts = [];

  if (caseData) {
    parts.push(
      caseData.titel || caseData.title,
      caseData.alder || caseData.age,
      caseData.diagnoser || caseData.diagnoses || caseData.relevante_diagnoser,
      caseData.tema || caseData.theme || caseData.kategori,
      caseData.problem || caseData.kort_beskrivelse || caseData.description || caseData.beskrivelse,
      caseData.barnets_oplevelse || caseData.barnets_perspektiv || caseData.childVoice,
      caseData.typisk_fejl || caseData.mistakes,
      caseData.løsning || caseData.loesning || caseData.solution,
      caseData.tiltag || caseData.værktøjer || caseData.vaerktoejer || caseData.tools
    );
  }

  if (activeContext?.summary || activeContext?.known_context || activeContext?.last_user_message) {
    parts.push(
      activeContext.summary,
      activeContext.known_context,
      activeContext.last_user_message
    );
  }

  return parts
    .map((part) => limitSpecialistTextFromEngine(part, 360))
    .filter(Boolean)
    .join(' ');
}

export function getTargetedSpecialistPanelFromEngine({
  angle = 'specialists',
  message = '',
  extraText = '',
  specialists = [],
} = {}) {
  const list = Array.isArray(specialists) ? specialists : [];
  const candidateSpecialists =
    angle === 'specialists'
      ? list.filter((specialist) => !isExcludedFromDefaultSpecialistPanelFromEngine(specialist))
      : list;

  const baseText = normalizeSpecialistPhrase(`${message} ${extraText}`);
  const caseSignals = extractSpecialistCaseSignals(`${message} ${extraText}`);
  const text = normalizeSpecialistPhrase([baseText, ...caseSignals].join(' '));

  const anglePatterns = {
    psychologist: ['psykolog', 'psykologisk', 'psykologi', 'ppr', 'angst', 'stress', 'terapi'],
    ppr: ['ppr', 'skolepsykolog', 'raadgivning', 'rådgivning', 'observation', 'indstilling', 'stotte', 'støtte'],
    specialists: [],
    case_team: [],
    named: [],
  };

  const specialistKeywords = (specialist) =>
    Array.isArray(specialist?.keywords)
      ? specialist.keywords.map((keyword) => normalizeSpecialistPhrase(keyword)).filter(Boolean)
      : [];

  const scored = candidateSpecialists.map((specialist, index) => {
    const keywords = specialistKeywords(specialist);
    const functionTerms = specialistFieldTerms(specialist?.function);
    const groupTerms = specialistFieldTerms(specialist?.group);
    const categoryTerms = specialistFieldTerms(specialist?.category);
    let score = 0;

    for (const pattern of anglePatterns[angle] || []) {
      const normalizedPattern = normalizeSpecialistPhrase(pattern);
      if (
        keywords.includes(normalizedPattern) ||
        functionTerms.includes(normalizedPattern) ||
        groupTerms.includes(normalizedPattern) ||
        categoryTerms.includes(normalizedPattern)
      ) {
        score += 40;
      }
    }

    for (const keyword of keywords) {
      if (specialistTextIncludes(text, keyword)) {
        score += keyword.includes(' ') ? 18 : 12;
      }
    }

    for (const term of functionTerms) {
      if (specialistTextIncludes(text, term)) {
        score += term.includes(' ') ? 10 : 6;
      }
    }

    let groupCategoryScore = 0;
    for (const term of [...groupTerms, ...categoryTerms]) {
      if (specialistTextIncludes(text, term)) {
        groupCategoryScore += term.includes(' ') ? 4 : 3;
      }
    }
    score += Math.min(groupCategoryScore, 8);

    return { specialist, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const maxCount = angle === 'case_team' ? 5 : angle === 'specialists' ? 3 : 1;
  const selected = scored.filter((item) => item.score > 0).slice(0, maxCount);

  const cleanValue = (value, max = 160) =>
    limitSpecialistTextFromEngine(value, max)
      .replace(/[|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const rows = selected.map(({ specialist }) => {
    const keywords = Array.isArray(specialist?.keywords)
      ? specialist.keywords.slice(0, 8).join(', ')
      : '';

    return [
      cleanValue(specialist?.id, 80),
      cleanValue(specialist?.name, 120),
      cleanValue(specialist?.group, 120),
      cleanValue(specialist?.function, 220),
      cleanValue(keywords, 180),
    ].join('|');
  });

  return {
    specialistIds: selected
      .map(({ specialist }) => String(specialist?.id || ''))
      .filter(Boolean),
    specialistSummaries: selected
      .map(({ specialist }) => ({
        id: String(specialist?.id || ''),
        name: String(specialist?.name || ''),
        group: String(specialist?.group || ''),
        function: String(specialist?.function || ''),
      }))
      .filter((specialist) => specialist.id),
    indexText: [
      'KOLONNER:id|navn|gruppe|funktion|keywords',
      ...rows,
    ].join('\n'),
  };
}

export function analyzeSpecialistRequestFromEngine({
  message = '',
  activeCase = null,
  activeContext = null,
  specialists = [],
} = {}) {
  const isDirectRequest = isDirectSpecialistPanelRequestFromEngine(message, specialists);
  const isCaseTeamRequest = isCaseSpecialistsInvolvedRequestFromEngine(message);

  if (!isDirectRequest && !isCaseTeamRequest) {
    return {
      specialistRequested: false,
      requestType: 'none',
      angle: null,
      panel: { specialistIds: [], specialistSummaries: [], indexText: '' },
      caseContextBlock: '',
      selectionContext: '',
      confidence: 'not_requested',
    };
  }

  const requestType = isCaseTeamRequest ? 'case_team' : 'direct_panel';
  const angle = isCaseTeamRequest
    ? 'case_team'
    : getRequestedSpecialistAngleFromEngine(message, specialists);
  const namedSpecialist = angle === 'named'
    ? findNamedSpecialistInMessageFromEngine(message, specialists)
    : null;
  const caseContextBlock = buildCompactSpecialistCaseContextFromEngine(activeCase, activeContext);
  const selectionContext = buildSpecialistSelectionContextFromEngine(activeCase, activeContext);
  const panel = angle === 'named'
    ? buildSingleSpecialistPanelFromEngine(namedSpecialist)
    : getTargetedSpecialistPanelFromEngine({
        angle,
        message,
        extraText: selectionContext,
        specialists,
      });

  return {
    specialistRequested: true,
    requestType,
    angle,
    panel,
    caseContextBlock,
    selectionContext,
    confidence: panel.specialistIds.length > 0 ? 'safe_match' : 'no_match',
  };
}
