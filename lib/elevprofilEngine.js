// Elevprofil-motor.
//
// Bygger både den strukturerede elevprofil (faste felter) og den
// laesbare profiltekst ud fra laererens fritekst.
//
// OpenAI-klienten instantieres IKKE her. Den sendes med som parameter
// fra cda-chat.js (samme moenster som specialistEngine.js og de andre
// motorer, der allerede fungerer), saa vi undgaar to forskellige
// OpenAI-instanser i spil.

import {
  normalizeDiagnosisPhrase,
} from "./textNormalize.js";

function isStudentProfileRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  const blockedPatterns = [
    "pbl profil",
    "pbl profile",
    "projektprofil",
    "projekt profil",
  ];

  if (blockedPatterns.some((pattern) => text.includes(pattern))) {
    return false;
  }

  const profilePatterns = [
    "opret elevprofil",
    "lav elevprofil",
    "dan elevprofil",
    "udfyld elevprofil",
    "opret skoleprofil",
    "lav skoleprofil",
    "dan skoleprofil",
    "udfyld skoleprofil",
    "opret arbejdsprofil",
    "lav arbejdsprofil",
    "dan arbejdsprofil",
    "udfyld arbejdsprofil",
    "opret profil for",
    "lav profil for",
    "dan profil for",
    "udfyld profil for",
  ];

  return profilePatterns.some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}


function extractLabeledStudentProfileValue(message, labels = []) {
  const text = String(message || "");

  for (const label of labels) {
    const escapedLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`^\\s*${escapedLabel}\\s*:\\s*(.+?)\\s*$`, "im"));

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function extractStudentProfileRegistration(message) {
  return {
    elev_arbejdsnavn: extractLabeledStudentProfileValue(message, [
      "Navn / arbejdsnavn",
      "Elev / arbejdsnavn",
      "Elevnavn",
      "Navn",
    ]),
    klasse_gruppe: extractLabeledStudentProfileValue(message, [
      "Klasse / gruppe",
      "Klasse",
      "Gruppe",
    ]),
    oprettet_af_signatur: extractLabeledStudentProfileValue(message, [
      "Oprettet af / signatur",
      "Signatur",
      "Skrevet af",
    ]),
  };
}

function stripStudentProfileRegistrationLines(message) {
  return String(message || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) return true;

      return !/^(?:opret\s+elevprofil|navn\s*\/\s*arbejdsnavn|elev\s*\/\s*arbejdsnavn|elevnavn|klasse\s*\/\s*gruppe|oprettet\s+af\s*\/\s*signatur|inds[æa]t\s+elevcase\s+her)\s*:?/i.test(trimmed);
    })
    .join("\n")
    .replace(/\[\s*INDS[ÆA]T\s+ELEVCASE\s+HER\s*\]/gi, "")
    .trim();
}

function getStudentProfileSchema() {
  return {
    type: "object",
    properties: {
      elev_arbejdsnavn: { type: "string" },
      klasse_gruppe: { type: "string" },
      primaere_observationer: { type: "string" },
      laering_og_opgaver: { type: "string" },
      koncentration_udholdenhed: { type: "string" },
      socialt_samspil: { type: "string" },
      gruppearbejde: { type: "string" },
      skift_overgange: { type: "string" },
      belastninger_triggere: { type: "string" },
      det_der_virker: { type: "string" },
      det_der_boer_observeres: { type: "string" },
      keywords: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "elev_arbejdsnavn",
      "klasse_gruppe",
      "primaere_observationer",
      "laering_og_opgaver",
      "koncentration_udholdenhed",
      "socialt_samspil",
      "gruppearbejde",
      "skift_overgange",
      "belastninger_triggere",
      "det_der_virker",
      "det_der_boer_observeres",
      "keywords",
    ],
    additionalProperties: false,
  };
}

function formatStudentProfile(profile, language = "Dansk") {
  const missing = language === "English"
    ? "Not stated yet."
    : "Ikke oplyst endnu.";

  const cleanField = (value) => {
    const text = String(value || "").trim();
    return text || missing;
  };

  const keywords = Array.isArray(profile?.keywords)
    ? profile.keywords
        .map((keyword) => String(keyword || "").trim())
        .filter(Boolean)
    : [];

  const keywordText = keywords.length > 0
    ? keywords.join(", ")
    : missing;

  if (language === "English") {
    return [
      "## Student profile v1",
      "",
      `**Student / working name:** ${cleanField(profile?.elev_arbejdsnavn)}`,
      `**Class / group:** ${cleanField(profile?.klasse_gruppe)}`,
      `**Primary observations:** ${cleanField(profile?.primaere_observationer)}`,
      `**Learning and tasks:** ${cleanField(profile?.laering_og_opgaver)}`,
      `**Concentration / stamina:** ${cleanField(profile?.koncentration_udholdenhed)}`,
      `**Social interaction:** ${cleanField(profile?.socialt_samspil)}`,
      `**Group work:** ${cleanField(profile?.gruppearbejde)}`,
      `**Transitions:** ${cleanField(profile?.skift_overgange)}`,
      `**Load / triggers:** ${cleanField(profile?.belastninger_triggere)}`,
      `**What works:** ${cleanField(profile?.det_der_virker)}`,
      `**Should be observed:** ${cleanField(profile?.det_der_boer_observeres)}`,
      `**Keywords:** ${keywordText}`,
    ].join("\n\n");
  }

  return [
    "## Elevprofil v1",
    "",
    `**Elev / arbejdsnavn:** ${cleanField(profile?.elev_arbejdsnavn)}`,
    `**Klasse / gruppe:** ${cleanField(profile?.klasse_gruppe)}`,
    `**Primære observationer:** ${cleanField(profile?.primaere_observationer)}`,
    `**Læring og opgaver:** ${cleanField(profile?.laering_og_opgaver)}`,
    `**Koncentration / udholdenhed:** ${cleanField(profile?.koncentration_udholdenhed)}`,
    `**Socialt samspil:** ${cleanField(profile?.socialt_samspil)}`,
    `**Gruppearbejde:** ${cleanField(profile?.gruppearbejde)}`,
    `**Skift / overgange:** ${cleanField(profile?.skift_overgange)}`,
    `**Belastninger og triggere:** ${cleanField(profile?.belastninger_triggere)}`,
    `**Det der virker:** ${cleanField(profile?.det_der_virker)}`,
    `**Det der bør observeres:** ${cleanField(profile?.det_der_boer_observeres)}`,
    `**Keywords:** ${keywordText}`,
  ].join("\n\n");
}

async function createStudentProfileFromText(message, language = "Dansk", openai) {
  const registration = extractStudentProfileRegistration(message);
  const studentCaseText = stripStudentProfileRegistrationLines(message);
  const missing = language === "English" ? "Not stated yet." : "Ikke oplyst endnu.";

  const instructions = [
    "Du er CDA Profilgenerator v1.",
    "Din eneste opgave er at udtrække en kort skolefaglig elevprofil fra lærerens fritekst.",
    "Profilen er arbejdsdata til skolebrug, ikke journal, ikke psykolograpport og ikke diagnosevurdering.",
    "Brug kun oplysninger, som læreren faktisk har givet, eller som er direkte skolefagligt afledt af teksten.",
    "Gæt ikke. Stil ikke diagnose. Skriv ikke lange forklaringer.",
    "Brug registreringsfelterne præcist som metadata. Ændr ikke navn eller klasse/gruppe.",
    "Hvis et felt mangler data, skriv præcist: Ikke oplyst endnu.",
    "Keywords skal være korte arbejdsnøgler udledt af elevcasen, ikke en fast liste.",
    "Keywords må ikke være hele sætninger.",
    "Hold hvert felt kort. Rene facts. Ingen fyldtekst.",
    language === "English"
      ? "Return content in English, but keep schema keys unchanged."
      : "Returnér indhold på dansk.",
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input: [
      "REGISTRERINGSFELTER:",
      `elev_arbejdsnavn: ${registration.elev_arbejdsnavn || missing}`,
      `klasse_gruppe: ${registration.klasse_gruppe || missing}`,
      "",
      "ELEVCASE:",
      studentCaseText || message,
      "",
      "Udtræk profilen i de faste felter. Navn og klasse/gruppe skal gengives præcist i de tilsvarende schemafelter.",
    ].join("\n"),
    max_output_tokens: 850,
    text: {
      format: {
        type: "json_schema",
        name: "cda_student_profile_v1",
        strict: true,
        schema: getStudentProfileSchema(),
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra profilgeneratoren");
  }

  const profile = JSON.parse(response.output_text || "{}");

  profile.elev_arbejdsnavn = registration.elev_arbejdsnavn || profile.elev_arbejdsnavn || missing;
  profile.klasse_gruppe = registration.klasse_gruppe || profile.klasse_gruppe || missing;

  return {
    profile,
    response,
    reply: formatStudentProfile(profile, language),
  };
}



function isReadableStudentProfileRequest(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (!text) {
    return false;
  }

  if (isStudentProfileRequest(message)) {
    return false;
  }

  const profileTextPatterns = [
    "vis profil",
    "vis elevprofil",
    "vis skoleprofil",
    "vis arbejdsprofil",
    "laesbar profil",
    "laesbar elevprofil",
    "laesbar skoleprofil",
    "laesbar tekst",
    "skriv profil",
    "skriv elevprofil",
    "skriv skoleprofil",
    "omskriv profil",
    "omskriv elevprofil",
    "lav profiltekst",
    "lav laesbar profil",
    "lav laesbar elevprofil",
    "lav laesbar tekst",
    "kort laererprofil",
    "tekst til teammode",
    "notat til teammode",
    "teamnotat",
    "notat til ppr",
    "kort notat til ppr",
  ];

  const developmentPatterns = [
    "udviklingsstatus",
    "mulig udvikling",
    "mulige udvikling",
    "progression",
    "udvikling over tid",
    "kort udvikling",
    "status for udvikling",
    "hvad er naeste skridt",
    "naeste skridt ud fra profilen",
  ];

  return [...profileTextPatterns, ...developmentPatterns].some((pattern) =>
    text.includes(normalizeDiagnosisPhrase(pattern))
  );
}

function getReadableStudentProfileIntent(message) {
  const text = normalizeDiagnosisPhrase(message);

  if (
    [
      "udviklingsstatus",
      "mulig udvikling",
      "mulige udvikling",
      "progression",
      "udvikling over tid",
      "kort udvikling",
      "status for udvikling",
      "hvad er naeste skridt",
      "naeste skridt ud fra profilen",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "development_status";
  }

  if (
    [
      "team",
      "teammode",
      "teamnotat",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "team_note";
  }

  if (
    [
      "ppr",
      "notat til ppr",
    ].some((pattern) => text.includes(normalizeDiagnosisPhrase(pattern)))
  ) {
    return "ppr_note";
  }

  return "readable_profile";
}

async function createReadableStudentProfileText(message, language = "Dansk", openai) {
  const intent = getReadableStudentProfileIntent(message);

  const intentRules = {
    readable_profile: "Skriv en kort læsbar lærerprofil i 2-4 korte afsnit.",
    development_status: "Skriv en kort udviklingsstatus med: aktuelt billede, det der virker, muligt næste skolefaglige fokus. Skriv kun mulig udvikling ud fra data, ikke løfter.",
    team_note: "Skriv et kort teamnotat, som flere lærere/vikarer kan bruge som fælles arbejdsgrundlag.",
    ppr_note: "Skriv et kort neutralt PPR-egnet arbejdsnotat uden diagnosekonklusioner.",
  };

  const instructions = [
    "Du er CDA Profiltekst v1.",
    "Din eneste opgave er at omskrive en eksisterende elevprofil, keyword-profil eller skolefaglige nøgledata til en kort, læsbar tekst.",
    "Du må ikke oprette en ny 12-felts profil her. Du skal skrive menneskesprog ud fra de oplysninger, brugeren giver.",
    "Skriv skolefagligt, konkret og neutralt.",
    "Brug kun oplysninger, der står i brugerens tekst. Gæt ikke. Opfind ikke progression.",
    "Ingen diagnosekonklusioner. Ingen psykolograpport. Ingen lange forklaringer.",
    "Undgå 'hvis eleven...' når data allerede siger, hvad der sker. Skriv konkret.",
    "Hvis der mangler vigtige oplysninger, nævn det kort til sidst under 'Mangler at afklare'. Hvis der ikke mangler noget tydeligt, må du ikke skrive 'Ingen', 'Intet' eller lignende. Udelad i stedet hele afsnittet.",
    "Hold svaret kort og brugbart for lærerteamet.",
    intentRules[intent] || intentRules.readable_profile,
    language === "English"
      ? "Write in English."
      : "Skriv på dansk.",
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input: [
      "BRUGERENS ØNSKE OG PROFILDATA:",
      message,
      "",
      "Omskriv til kort, læsbar skolefaglig tekst.",
    ].join("\n"),
    max_output_tokens: 850,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra profiltekst-generatoren");
  }

  return {
    intent,
    response,
    reply: String(response.output_text || "").trim(),
  };
}


const tools = [
  {
    type: "function",
    name: "getPromptRules",
    description:
      "Henter dynamiske prompt-regler til CDA. response_style_rules, mode_switch_rules, source_priority_rules, general_rule og practice_situations er allerede indlæst og skal ikke hentes igen. Øvrige tilgængelige sektioner: domain_scope, specialist_trigger_rules, template_trigger_rules, case_trigger_rules, diagnosis_trigger_rules, roleplay_rules, emotion_trigger_rules, bornehave_trigger_rules, cda_training_rules, roleplay_learning_rules, action_rules, roleplay_emotion_rules, conflict_mediator_rules, comorbidity_rules, school_home_dialogue_rules. Hent den sektion der matcher situationen, fx comorbidity_rules ved mulig komorbiditet, school_home_dialogue_rules ved skole-hjem-kommunikation, eller specialist_trigger_rules/template_trigger_rules før specialister eller skabeloner bruges.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Præcist sektionsnavn fra listen ovenfor, fx comorbidity_rules, source_priority_rules eller conflict_mediator_rules.",
        },
      },
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "getPblProjects",
    description:
      "Henter og matcher PBL-projekter fra CDA. Brug ved elevinteresser, praktiske styrker, uro, kort koncentration, lav motivation eller behov for aktivering.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description:
            "Direkte elevinteresse eller fritekstsøgning, fx cykel, dyr, Minecraft eller træarbejde.",
        },
        diagnosis: {
          type: "string",
          description:
            "Diagnosefilter, fx ADHD, autisme eller DCD.",
        },
        level: {
          type: "string",
          description:
            "Projektets niveau, fx Junior, Intermediate eller Advanced.",
        },
        social: {
          type: "string",
          description:
            "Social belastning, fx Lav, Moderat eller Gruppe.",
        },
        structure: {
          type: "string",
          description:
            "Behov for struktur, fx Lav, Moderat eller Høj.",
        },
        stimuli: {
          type: "string",
          description:
            "Foretrukken stimulustype, fx Taktil, Visuel eller Kinæstetisk.",
        },
        id: {
          type: "string",
          description:
            "Hent et bestemt PBL-projekt via projekt-id.",
        },
      },
      additionalProperties: false,
    },
    strict: false,
  },
  {
  type: "function",
  name: "getCases",
  description:
    "Henter eksisterende CDA-cases. Brug ved forespørgsler om cases, træningscases, konkrete skolesituationer, diagnoser, temaer eller kategorier.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Hent en bestemt case via case-id.",
      },
      search: {
        type: "string",
        description:
          "Fritekstsøgning i casebiblioteket, fx uro, konflikt, skolevægring eller gruppearbejde.",
      },
      tema: {
        type: "string",
        description: "Filtrér cases efter tema.",
      },
      diagnose: {
        type: "string",
        description: "Filtrér cases efter diagnose.",
      },
      kategori: {
        type: "string",
        description: "Filtrér cases efter kategori.",
      },
    },
    additionalProperties: false,
  },
    strict: false,
},
{
  type: "function",
  name: "getBornehaveRouting",
  description:
    "Henter eksisterende CDA-børnehaverouting. Brug ved børn i børnehave, observation, adfærd, overlevering til skole eller valg af børnehaveskabelon.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Beskrivelse af barnet eller situationen.",
      },
      age: {
        type: "number",
        description: "Barnets alder.",
      },
      category: {
        type: "string",
        description: "Valgfri kategori.",
      },
      tags: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Valgfrie observationstags.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getDiagnoser",
  description:
    "Henter eksisterende CDA-diagnosedata. Brug ved spørgsmål om diagnoser, symptombilleder, kategorier eller komorbiditet.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Hent en bestemt diagnose via diagnose-id.",
      },
      search: {
        type: "string",
        description:
          "Søg efter diagnose via navn, fuldt navn, nøgleord eller kategori.",
      },
      kategori: {
        type: "string",
        description: "Filtrér diagnoser efter kategori.",
      },
      komorbiditet: {
        type: "string",
        description:
          "Filtrér diagnoser efter kobling til en mulig komorbiditet.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getEmotionAnalysis",
  description:
    "Analyserer eksisterende CDA-kommunikation for tone, pres, empati, validering og kommandoer.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Den tekst eller formulering, der skal analyseres.",
      },
      context: {
        type: "string",
        description: "Valgfri kontekst for kommunikationen.",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getKomorbiditet",
  description:
    "Henter eksisterende CDA-komorbiditetsdata. Brug ved spørgsmål om mulig komorbiditet, primær diagnose eller konkrete triggertegn.",
  parameters: {
    type: "object",
    properties: {
      primary: {
        type: "string",
        description:
          "Primær diagnose, fx ADHD eller autisme.",
      },
      id: {
        type: "string",
        description:
          "Hent en bestemt komorbiditet via id.",
      },
      trigger: {
        type: "string",
        description:
          "Søg efter komorbiditet ud fra et konkret triggertegn.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getSemanticSearch",
  description:
    "Søger semantisk i det eksisterende CDA-casearkiv og skelner mellem primær diagnose, komorbid diagnose og tekstmatch.",
  parameters: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Søgetekst, diagnose, tema eller problemstilling.",
      },
    },
    required: ["search"],
    additionalProperties: false,
  },
  strict: false,
},
{
  type: "function",
  name: "getTemplates",
  description:
    "Henter eksisterende CDA-skabeloner og søgeindeks. Brug ved forespørgsler om skabeloner, rapporter, skole-hjem-kommunikation, møder eller overlevering.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Brug værdien index for kun at hente skabelonernes søgeindeks.",
      },
    },
    additionalProperties: false,
  },
  strict: false,
},
];
export {
  isStudentProfileRequest,
  createStudentProfileFromText,
  isReadableStudentProfileRequest,
  createReadableStudentProfileText,
};
