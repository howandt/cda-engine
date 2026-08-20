// CDA Engine 24B.18C
// SpecialistEngine owns specialist routing, selection and response execution.
//
// The API conductor passes message, case context and OpenAI access here.
// This motor keeps the specialist panel secondary and only activates it on a
// clear user request. Specialist identities and functions always come from the
// local specialist data file; case-specific assessments remain dynamic.

import fs from 'fs';
import path from 'path';
import { getLocalTemplateRequest } from './templateResourceEngine.js';

export const SPECIALIST_ENGINE_VERSION = '24B.18C-complete-specialist-flow';

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

let cachedSpecialistData = null;

function readSpecialistData() {
  if (cachedSpecialistData) {
    return cachedSpecialistData;
  }

  const filePath = path.join(
    process.cwd(),
    'data',
    'CDA_SpecialistPanel.json'
  );

  if (!fs.existsSync(filePath)) {
    throw new Error('data/CDA_SpecialistPanel.json blev ikke fundet');
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  cachedSpecialistData = data;
  return cachedSpecialistData;
}

function readSpecialists() {
  const data = readSpecialistData();
  return Array.isArray(data?.specialists) ? data.specialists : [];
}

function readPprFramework() {
  const framework = readSpecialistData()?.ppr_framework;

  if (!framework || typeof framework !== 'object') {
    throw new Error(
      'ppr_framework mangler i data/CDA_SpecialistPanel.json'
    );
  }

  return framework;
}

function hasActiveSpecialistContext(activeCase, activeContext) {
  return Boolean(
    activeCase ||
      activeContext?.summary ||
      activeContext?.known_context ||
      activeContext?.last_user_message
  );
}

function isSpecialistPanelOverviewRequest(message) {
  const text = normalizeSpecialistPhrase(message);

  if (!text) {
    return false;
  }

  const overviewPatterns = [
    'hvilke specialister sidder i specialistpanelet',
    'hvem sidder i specialistpanelet',
    'hvilke specialister er i specialistpanelet',
    'hvem er i specialistpanelet',
    'vis specialistpanelet',
    'vis specialist panel',
    'liste over specialister',
    'list specialister',
    'hvilke specialister har du',
    'hvilke cda specialister',
  ].map((pattern) => normalizeSpecialistPhrase(pattern));

  return overviewPatterns.some((pattern) => text.includes(pattern));
}

function buildSpecialistPanelOverviewReply(specialists) {
  if (specialists.length === 0) {
    return 'Jeg kan ikke finde specialistpanelet i de interne CDA-data lige nu.';
  }

  const byGroup = new Map();

  for (const specialist of specialists) {
    const group = String(specialist?.group || 'Øvrige').trim() || 'Øvrige';
    const name = String(specialist?.name || 'Ukendt specialist').trim();
    const focus = String(
      specialist?.function || 'Faglig specialistvinkel'
    ).trim();

    if (!byGroup.has(group)) {
      byGroup.set(group, []);
    }

    byGroup.get(group).push(`- ${name}: ${focus}`);
  }

  const lines = [
    'Ja. Specialistpanelet ligger i CDA’s interne specialistdata.',
    '',
    `Der er ${specialists.length} specialister i panelet:`,
  ];

  for (const [group, rows] of byGroup.entries()) {
    lines.push('', `**${group}**`, ...rows);
  }

  lines.push(
    '',
    'Ved en konkret case vælger CDA normalt højst 3 relevante specialistvinkler.'
  );

  return lines.join('\n');
}

function isLocalPprCaseAngleRequest(message) {
  const text = normalizeSpecialistPhrase(message);

  if (!text.includes('ppr')) {
    return false;
  }

  const pprPatterns = [
    'ppr',
    'hvad siger ppr',
    'hvad ville ppr',
    'hvad vil ppr',
    'hvad ser ppr',
    'hvad ville ppr se',
    'hvad ville ppr kigge paa',
    'hvad ville ppr kigge på',
    'ppr vinkel',
    'ppr-vinkel',
    'ppr se',
    'ppr spoerge',
    'ppr spørge',
  ];

  return pprPatterns.some((pattern) => {
    const normalizedPattern = normalizeSpecialistPhrase(pattern);
    return text === normalizedPattern || text.includes(normalizedPattern);
  });
}

function getPprTemplateReference(
  message,
  activeCase,
  activeContext,
  framework
) {
  const caseText = buildSpecialistSelectionContextFromEngine(
    activeCase,
    activeContext
  );
  let request = getLocalTemplateRequest(
    `Find guide til PPR ${message} ${caseText}`
  );

  const pprRelevanceText = [
    request?.template?.title,
    request?.template?.description,
    ...(Array.isArray(request?.template?.tags) ? request.template.tags : []),
    ...(Array.isArray(request?.template?.search_keywords)
      ? request.template.search_keywords
      : []),
  ]
    .filter(Boolean)
    .join(' ');

  if (
    request?.type !== 'match' ||
    !normalizeSpecialistPhrase(pprRelevanceText).includes('ppr')
  ) {
    const fallbackSearch = String(
      framework?.template_fallback_search || ''
    ).trim();

    request = fallbackSearch
      ? getLocalTemplateRequest(`Find guide ${fallbackSearch}`)
      : null;
  }

  if (request?.type !== 'match' || !request.template) {
    return null;
  }

  return {
    id: request.template.id || null,
    title: request.template.title || null,
    description:
      request.template.description || request.context?.description || null,
    purpose: request.context?.purpose || null,
    cda_synthesis: request.context?.cda_synthesis || null,
  };
}

async function runDynamicPprAngle({
  openai,
  message,
  activeCase,
  activeContext,
  pendingAction,
  role,
  responseStyle,
  contextSource,
}) {
  if (!hasActiveSpecialistContext(activeCase, activeContext)) {
    return buildLocalResult({
      reply:
        'Jeg mangler en konkret case at give en PPR-vinkel på. Beskriv kort situationen, hvad der er observeret, og hvad der allerede er forsøgt.',
      usedTools: ['pprAngleMissingCase'],
      toolDebug: [
        {
          name: 'pprAngleMissingCase',
          role,
          response_style: responseStyle,
        },
      ],
      pendingAction,
    });
  }

  const framework = readPprFramework();
  const caseContext = buildCompactSpecialistCaseContextFromEngine(
    activeCase,
    activeContext
  );
  const templateReference = getPprTemplateReference(
    message,
    activeCase,
    activeContext,
    framework
  );

  const instructions = [
    "Du er CDA's PPR-faglige konsulent.",
    'Giv en dynamisk PPR-vinkel på den aktive case. Svaret skal ændre sig med casens faktiske oplysninger.',
    'Skeln tydeligt mellem konkrete observationer, mulige faglige hypoteser, manglende oplysninger og næste skridt.',
    'Gengiv ikke en generisk PPR-tjekliste. Vælg kun de dimensioner fra PPR-RAMMEN, der er relevante for denne case.',
    'Opfind ikke oplysninger. Stil ikke diagnose og foretag ikke en psykologisk eller juridisk afgørelse.',
    'Placér ikke ansvaret ensidigt hos barnet, hjemmet eller skolen.',
    'Giv højst tre konkrete næste skridt.',
    'Hvis en RELEVANT CDA-GUIDE ELLER SKABELON er vedlagt, må den kun nævnes, hvis den konkret understøtter et af de valgte næste skridt. Opfind aldrig en guide eller skabelon.',
    'Skriv som en nærværende faglig rådgiver, ikke som en chatbot.',
    responseStyle === 'Dyb'
      ? 'Uddyb de faglige sammenhænge, men hold observation og hypotese adskilt.'
      : responseStyle === 'Kort'
        ? 'Svar kort og præcist.'
        : 'Svar fokuseret med en kort faglig begrundelse.',
  ].join('\n');

  const input = [
    caseContext,
    '',
    'BRUGERENS SPØRGSMÅL:',
    message,
    '',
    'PPR-RAMME FRA CDA-DATA:',
    JSON.stringify(framework, null, 2),
    '',
    'RELEVANT CDA-GUIDE ELLER SKABELON:',
    templateReference
      ? JSON.stringify(templateReference, null, 2)
      : 'Ingen sikker relevant guide eller skabelon fundet.',
  ].join('\n');

  const response = await openai.responses.create({
    model: 'gpt-5.4-mini',
    reasoning: { effort: 'low' },
    instructions,
    input,
    max_output_tokens:
      responseStyle === 'Dyb' ? 1600 : responseStyle === 'Kort' ? 800 : 1200,
    text: {
      format: {
        type: 'json_schema',
        name: 'cda_dynamic_ppr_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
          },
          required: ['reply'],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === 'incomplete') {
    const incompleteReason =
      response?.incomplete_details?.reason || 'ukendt årsag';
    throw new Error(
      `Ufuldstændigt svar fra PPR-vinklen (${incompleteReason})`
    );
  }

  const parsed = JSON.parse(response.output_text || '{}');
  const reply = String(parsed.reply || '').trim();

  if (!reply) {
    throw new Error('PPR-vinklen returnerede intet svar');
  }

  const { usage } = getUsage(response, 'dynamic_ppr_angle');

  return {
    reply,
    model: 'gpt-5.4-mini',
    usedTools: ['dynamicPprAngle'],
    toolDebug: [
      {
        name: 'dynamicPprAngle',
        active_local_case_id: activeCase?.id || null,
        specialist_context_source: contextSource,
        selected_template_id: templateReference?.id || null,
        selected_template_title: templateReference?.title || null,
        role,
        response_style: responseStyle,
      },
    ],
    usedDataSources: [
      'data/CDA_SpecialistPanel.json',
      ...(templateReference
        ? ['data/CDA_Templates.json', 'data/CDA_TemplateFiles.json']
        : []),
    ],
    conversationMode: 'specialist',
    pendingAction,
    usage,
  };
}

function getUsage(response, phase) {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  const totalTokens = Number(
    response?.usage?.total_tokens || inputTokens + outputTokens
  );

  return {
    usage: [
      {
        call: 1,
        phase,
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
  };
}

function buildLocalResult({
  reply,
  usedTools,
  toolDebug,
  pendingAction,
}) {
  return {
    reply,
    model: 'local',
    usedTools,
    toolDebug,
    usedDataSources: ['data/CDA_SpecialistPanel.json'],
    conversationMode: 'specialist',
    pendingAction,
    usage: [],
  };
}

function parsePanelResponse(response, specialistIds, maxSelected) {
  if (response.status === 'incomplete') {
    throw new Error('Ufuldstændigt svar fra specialistpanelet');
  }

  const panelResponse = JSON.parse(response.output_text || '{}');
  const validSpecialistIds = new Set(specialistIds);
  const selectedSpecialistIds = Array.from(
    new Set(
      (Array.isArray(panelResponse.selected_specialist_ids)
        ? panelResponse.selected_specialist_ids
        : []
      ).filter((id) => validSpecialistIds.has(String(id)))
    )
  ).slice(0, maxSelected);
  const reply = String(panelResponse.reply || '').trim();

  if (!reply) {
    throw new Error('Specialistpanelet returnerede intet svar');
  }

  return { reply, selectedSpecialistIds };
}

async function runDirectSpecialistPanel({
  openai,
  message,
  activeCase,
  activeContext,
  pendingAction,
  role,
  responseStyle,
  specialists,
  contextSource,
}) {
  const requestedAngle = getRequestedSpecialistAngleFromEngine(
    message,
    specialists
  );

  if (requestedAngle === 'ppr') {
    return runDynamicPprAngle({
      openai,
      message,
      activeCase,
      activeContext,
      pendingAction,
      role,
      responseStyle,
      contextSource,
    });
  }

  const caseContextBlock = buildCompactSpecialistCaseContextFromEngine(
    activeCase,
    activeContext
  );
  const selectionContext = buildSpecialistSelectionContextFromEngine(
    activeCase,
    activeContext
  );
  const specialistPanel =
    requestedAngle === 'named'
      ? buildSingleSpecialistPanelFromEngine(
          findNamedSpecialistInMessageFromEngine(message, specialists)
        )
      : getTargetedSpecialistPanelFromEngine({
          angle: requestedAngle,
          message,
          extraText: selectionContext,
          specialists,
        });

  if (specialistPanel.specialistIds.length === 0) {
    return buildLocalResult({
      reply: [
        '**Heidis CDA-samling**',
        '',
        'Jeg finder ikke et sikkert specialistmatch ud fra de aktive specialist-keywords i denne case.',
        '',
        'Derfor vælger jeg ikke specialister som gæt. Specialistpanelet er sekundært og skal kun kobles på, når de lokale keywords peger tydeligt på relevante fagvinkler.',
        '',
        'Heidi/CDA kan stadig arbejde videre med casen i det almindelige rådgivningsflow.',
      ].join('\n'),
      usedTools: ['specialistPanelNoKeywordMatch'],
      toolDebug: [
        {
          name: 'specialistPanelNoKeywordMatch',
          requested_angle: requestedAngle || null,
          active_local_case_id: activeCase?.id || null,
          specialist_context_source: contextSource,
          role,
          response_style: responseStyle,
        },
      ],
      pendingAction,
    });
  }

  const headingInstruction =
    requestedAngle === 'named' || requestedAngle === 'psychologist'
      ? 'Brug specialistens fulde navn fra RELEVANT LOKAL SPECIALISTDATA i specialistafsnittets overskrift. Brug kun en generisk rolle-overskrift, hvis intet navn findes i data.'
      : requestedAngle === 'ppr'
        ? 'Brug PPR-vinklen som særskilt specialistvinkel, men afslut stadig med fælles evaluering og Heidi/CDA-samling.'
        : 'Brug specialistpanelets 360-graders struktur: først kort fælles retning, derefter op til 3 specialistvinkler, derefter fælles evaluering og til sidst Heidi/CDA-samling.';

  const instructions = [
    'Du er Heidi i CDA Engine.',
    'Svar kun, fordi brugeren selv har bedt om specialistvinkel på den aktive case/sag.',
    'Brug den aktive case/sag som konkret grundlag. Opfind ikke manglende casefelter.',
    'Stil ikke diagnose. Giv ikke medicinråd. Beskriv kun støttebehov, mønstre og næste faglige skridt.',
    'Brug kun specialister, navne, grupper og funktioner fra RELEVANT LOKAL SPECIALISTDATA. Opfind ikke specialister.',
    'Udvælg højst 3 specialistvinkler. Hver specialist skal bidrage med sin egen faglige vinkel på netop denne case.',
    'Skriv ikke faste specialisttekster. Formulér hvert afsnit ud fra specialistens funktion, de lokale data og den aktive case.',
    "Svar med denne struktur: **Kort samlet specialistretning**, derefter ét afsnit pr. specialist med navn, fagligt fokus, hvad specialisten opdager i casen og 1 kort anbefaling, derefter **Fælles evaluering**, og til sidst **Heidis CDA-samling**.",
    'Den fælles evaluering skal samle specialisternes opdagelser til et 360-graders blik. Heidi/CDA-samlingen skal gøre det praktisk for brugeren uden at overtage specialistrollerne.',
    'Hold svaret lærer-nært og praktisk. Samlet må der højst være 3 konkrete næste handlinger.',
    headingInstruction,
    responseStyle === 'Dyb'
      ? 'Svar lidt mere udførligt, men uden lange forklaringer.'
      : 'Svar kort og direkte.',
  ].join('\n');

  const input = [
    caseContextBlock,
    '',
    'BRUGERENS BESKED:',
    message,
    '',
    'RELEVANT LOKAL SPECIALISTDATA:',
    specialistPanel.indexText,
  ]
    .filter((part) => String(part || '').trim())
    .join('\n');

  const response = await openai.responses.create({
    model: 'gpt-5.4-mini',
    reasoning: { effort: 'low' },
    instructions,
    input,
    max_output_tokens:
      responseStyle === 'Dyb' ? 3000 : responseStyle === 'Kort' ? 1600 : 2200,
    text: {
      format: {
        type: 'json_schema',
        name: 'cda_targeted_specialist_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            selected_specialist_ids: {
              type: 'array',
              items: {
                type: 'string',
                enum: specialistPanel.specialistIds,
              },
            },
            reply: { type: 'string' },
          },
          required: ['selected_specialist_ids', 'reply'],
          additionalProperties: false,
        },
      },
    },
  });

  const { reply, selectedSpecialistIds } = parsePanelResponse(
    response,
    specialistPanel.specialistIds,
    requestedAngle === 'specialists' ? 3 : 1
  );
  const { usage } = getUsage(response, 'targeted_specialist_on_active_case');

  return {
    reply,
    model: 'gpt-5.4-mini',
    usedTools: ['targetedLocalSpecialistRouting'],
    toolDebug: [
      {
        name: 'targetedLocalSpecialistRouting',
        requested_angle: requestedAngle || null,
        active_local_case_id: activeCase?.id || null,
        specialist_context_source: contextSource,
        role,
        response_style: responseStyle,
        selected_specialists: selectedSpecialistIds
          .map((id) =>
            specialistPanel.specialistSummaries.find(
              (specialist) => specialist.id === id
            )
          )
          .filter(Boolean),
      },
    ],
    usedDataSources: ['data/CDA_SpecialistPanel.json'],
    conversationMode: 'specialist',
    pendingAction,
    usage,
  };
}

async function runCaseSpecialistsInvolved({
  openai,
  message,
  activeCase,
  activeContext,
  pendingAction,
  role,
  responseStyle,
  specialists,
  contextSource,
}) {
  if (!hasActiveSpecialistContext(activeCase, activeContext)) {
    return buildLocalResult({
      reply:
        'Jeg har ikke en aktiv case at knytte specialister til lige nu. Beskriv situationen, eller gå tilbage til en tidligere case, så kan jeg pege på hvilke CDA-specialister der er relevante.',
      usedTools: ['caseSpecialistsInvolvedNoActiveCase'],
      toolDebug: [
        {
          name: 'caseSpecialistsInvolvedNoActiveCase',
          role,
          response_style: responseStyle,
        },
      ],
      pendingAction: null,
    });
  }

  const caseText = [
    activeCase?.titel,
    activeCase?.title,
    activeCase?.problem,
    activeCase?.kort_beskrivelse,
    activeCase?.description,
    activeCase?.beskrivelse,
    activeContext?.summary,
    activeContext?.known_context,
    activeContext?.last_user_message,
  ]
    .filter(Boolean)
    .join(' ');

  const specialistPanel = getTargetedSpecialistPanelFromEngine({
    angle: 'case_team',
    message,
    extraText: caseText,
    specialists,
  });
  const caseContextBlock = buildCompactSpecialistCaseContextFromEngine(
    activeCase,
    activeContext
  );

  if (specialistPanel.specialistIds.length === 0) {
    throw new Error('Specialistpanelet indeholder ingen specialister');
  }

  const instructions = [
    'Du er Heidi i CDA Engine.',
    'Brugeren spørger, hvilke CDA-specialister der har været relevante for den aktive case/sag.',
    'Brug kun den aktive case/sag og RELEVANT LOKAL SPECIALISTDATA som grundlag. Opfind ikke manglende casefelter, specialister eller citater.',
    'Stil ikke diagnose. Giv ikke medicinråd.',
    'Vis hver relevant specialist på egen linje: **[specialistens fulde navn fra data]** efterfulgt af ét kort, case-specifikt fokuspunkt (1 linje).',
    'Nævn kun specialister som RELEVANT LOKAL SPECIALISTDATA faktisk indeholder. Hvis en specialist kun er indirekte relevant (fx kun ved mistanke om komorbiditet), skriv det kort.',
    "Afslut altid med én linje: 'Start her: [navn] + [navn]' med de 1-2 mest presserende specialister for netop denne case.",
    'Svar kort og konkret, uden lange forklaringer mellem punkterne.',
  ].join('\n');

  const input = [
    caseContextBlock,
    '',
    'BRUGERENS BESKED:',
    message,
    '',
    'RELEVANT LOKAL SPECIALISTDATA:',
    specialistPanel.indexText,
  ]
    .filter((part) => String(part || '').trim())
    .join('\n');

  const response = await openai.responses.create({
    model: 'gpt-5.4-mini',
    reasoning: { effort: 'low' },
    instructions,
    input,
    max_output_tokens:
      responseStyle === 'Dyb' ? 750 : responseStyle === 'Kort' ? 400 : 550,
    text: {
      format: {
        type: 'json_schema',
        name: 'cda_case_team_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            selected_specialist_ids: {
              type: 'array',
              items: {
                type: 'string',
                enum: specialistPanel.specialistIds,
              },
            },
            reply: { type: 'string' },
          },
          required: ['selected_specialist_ids', 'reply'],
          additionalProperties: false,
        },
      },
    },
  });

  const { reply, selectedSpecialistIds } = parsePanelResponse(
    response,
    specialistPanel.specialistIds,
    5
  );
  const { usage } = getUsage(response, 'case_specialists_involved');

  return {
    reply,
    model: 'gpt-5.4-mini',
    usedTools: ['caseSpecialistsInvolvedRouting'],
    toolDebug: [
      {
        name: 'caseSpecialistsInvolvedRouting',
        selected_specialists: selectedSpecialistIds
          .map((id) =>
            specialistPanel.specialistSummaries.find(
              (specialist) => specialist.id === id
            )
          )
          .filter(Boolean),
        active_local_case_id: activeCase?.id || null,
        specialist_context_source: contextSource,
        role,
        response_style: responseStyle,
      },
    ],
    usedDataSources: ['data/CDA_SpecialistPanel.json'],
    conversationMode: 'specialist',
    pendingAction,
    usage,
  };
}

export async function runSpecialistFlow({
  openai,
  message = '',
  activeCase = null,
  activeContext = null,
  pendingAction = null,
  role = 'Lærer',
  responseStyle = 'Mellem',
  contextSource = 'active_case_context',
} = {}) {
  const normalizedMessage = normalizeSpecialistPhrase(message);
  const hasSpecialistSignal = [
    'specialist',
    'psykolog',
    'ppr',
    'hvad siger',
    'hvad ville',
    'faglig vinkel',
  ].some((signal) => normalizedMessage.includes(signal));

  let specialists;

  try {
    specialists = readSpecialists();
  } catch (error) {
    if (hasSpecialistSignal) {
      throw error;
    }

    return null;
  }

  if (
    !hasSpecialistSignal &&
    !findNamedSpecialistInMessageFromEngine(message, specialists)
  ) {
    return null;
  }

  if (isSpecialistPanelOverviewRequest(message)) {
    return buildLocalResult({
      reply: buildSpecialistPanelOverviewReply(specialists),
      usedTools: ['localSpecialistPanelOverview'],
      toolDebug: [
        {
          name: 'localSpecialistPanelOverview',
          source: 'data/CDA_SpecialistPanel.json',
          role,
          response_style: responseStyle,
        },
      ],
      pendingAction,
    });
  }

  if (activeCase && isLocalPprCaseAngleRequest(message)) {
    return runDynamicPprAngle({
      openai,
      message,
      activeCase,
      activeContext,
      pendingAction,
      role,
      responseStyle,
      contextSource,
    });
  }

  if (isCaseSpecialistsInvolvedRequestFromEngine(message)) {
    return runCaseSpecialistsInvolved({
      openai,
      message,
      activeCase,
      activeContext,
      pendingAction,
      role,
      responseStyle,
      specialists,
      contextSource,
    });
  }

  if (!isDirectSpecialistPanelRequestFromEngine(message, specialists)) {
    return null;
  }

  return runDirectSpecialistPanel({
    openai,
    message,
    activeCase,
    activeContext,
    pendingAction,
    role,
    responseStyle,
    specialists,
    contextSource,
  });
}
