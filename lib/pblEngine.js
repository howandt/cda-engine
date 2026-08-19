import fs from "fs";
import path from "path";

function readTextFile(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }

  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile(filePath, errorMessage) {
  const raw = readTextFile(filePath, errorMessage);
  return JSON.parse(raw);
}

function normalizeReplyIntent(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchWord(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]/g, "");
}

function levenshteinDistance(a, b) {
  const first = normalizeSearchWord(a);
  const second = normalizeSearchWord(b);

  const matrix = Array.from(
    { length: second.length + 1 },
    () => Array(first.length + 1).fill(0)
  );

  for (let i = 0; i <= second.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= first.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= second.length; i += 1) {
    for (let j = 1; j <= first.length; j += 1) {
      const cost = second[i - 1] === first[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[second.length][first.length];
}

function searchWordMatches(searchWord, textWord) {
  const search = normalizeSearchWord(searchWord);
  const text = normalizeSearchWord(textWord);

  if (!search || !text) {
    return false;
  }

  if (text.includes(search) || search.includes(text)) {
    return true;
  }

  const shortestLength = Math.min(search.length, text.length);

  for (let length = shortestLength; length >= 4; length -= 1) {
    const searchStart = search.slice(0, length);
    const textStart = text.slice(0, length);

    if (searchStart === textStart) {
      return true;
    }
  }

  if (search.length >= 5 && text.length >= 5) {
    return levenshteinDistance(search, text) <= 2;
  }

  return false;
}

function getPblProjects(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_PBL_Projects.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_PBL_Projects.json blev ikke fundet"
  );

  let projects = Array.isArray(data.projects)
    ? [...data.projects]
    : [];

  if (args.id) {
    const project = projects.find(
      (item) => String(item.id || "") === String(args.id)
    );

    if (!project) {
      return {
        error: `PBL-projekt ikke fundet: ${args.id}`,
      };
    }

    return {
      version: data.version || null,
      project,
    };
  }

  let directInterestMatch = false;

if (args.search) {
  const searchTerms = String(args.search)
    .split(/\s+/)
    .map((term) => normalizeSearchWord(term))
    .filter(Boolean);

  const interestMatches = projects.filter((project) => {
    const searchableWords = [
      project.title,
      project.subtitle,
      project.description,
      ...(project.activities || []),
      ...(project.competencies || []),
      ...(project.career_alignment || []),
    ]
      .filter(Boolean)
      .join(" ")
      .split(/\s+/)
      .map((word) => normalizeSearchWord(word))
      .filter(Boolean);

    return searchTerms.every((searchTerm) =>
      searchableWords.some((textWord) =>
        searchWordMatches(searchTerm, textWord)
      )
    );
  });

  if (interestMatches.length > 0) {
    projects = interestMatches;
    directInterestMatch = true;
  }
}

if (directInterestMatch) {
  return {
    version: data.version || null,
    filtered_count: projects.length,
    direct_interest_match: true,
    projects,
  };
}

  if (args.diagnosis) {
    const diagnosisTerms = String(args.diagnosis)
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    projects = projects.filter((project) =>
      diagnosisTerms.some((term) =>
        (project.diagnosis_match || []).some((item) =>
          String(item).toLowerCase().includes(term)
        )
      )
    );
  }

  if (args.level) {
    projects = projects.filter(
      (project) =>
        String(project.level || "").toLowerCase() ===
        String(args.level).toLowerCase()
    );
  }

  if (args.social) {
    projects = projects.filter(
      (project) =>
        String(project.social_exposure || "").toLowerCase() ===
        String(args.social).toLowerCase()
    );
  }

  if (args.structure) {
    projects = projects.filter(
      (project) =>
        String(project.structure_need || "").toLowerCase() ===
        String(args.structure).toLowerCase()
    );
  }

  if (args.stimuli) {
    const stimuliTerms = String(args.stimuli)
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    projects = projects.filter((project) =>
      stimuliTerms.some((term) =>
        (project.stimuli_type || []).some((item) =>
          String(item).toLowerCase().includes(term)
        )
      )
    );
  }

  return {
    version: data.version || null,
    filtered_count: projects.length,
    projects,
  };
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getPblProfileTemplate() {
  return [
    "Udfyld kort det, du ved. Du behøver ikke have svar på alt:",
    "",
    "1. Alder og klassetrin:",
    "2. Interesser og det eleven selv opsøger:",
    "3. Praktiske, kreative eller faglige styrker:",
    "4. Hvor længe kan eleven typisk holde fokus?",
    "5. Behov for struktur, pauser og bevægelse:",
    "6. Arbejder eleven bedst alene, med én eller i en lille gruppe?",
    "7. Sanser eller belastninger, vi skal tage hensyn til:",
    "8. Modenhed og sikkerhed ved materialer eller værktøj:",
    "9. Hvor meget voksenstøtte kræves?",
    "10. Hvilket fagligt mål skal projektet støtte?",
    "11. Hvad er allerede prøvet, og hvad virkede eller virkede ikke?",
    "12. Din vurdering: Er PBL relevant nu — ja, nej eller usikkert?"
  ].join("\n");
}

function encodePblChoiceState(data) {
  return `pbl_choice:${Buffer.from(
    JSON.stringify(data),
    "utf8"
  ).toString("base64url")}`;
}

function decodePblChoiceState(value) {
  const text = String(value || "");

  if (!text.startsWith("pbl_choice:")) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(
        text.slice("pbl_choice:".length),
        "base64url"
      ).toString("utf8")
    );
  } catch {
    return null;
  }
}

function getPblProjectById(projectId) {
  const result = getPblProjects({ id: projectId });
  return result?.project || null;
}

function extractProfileField(profileText, fieldNumber) {
  const profileLabels = {
    1: "Alder og klassetrin:",
    2: "Interesser og det eleven selv opsøger:",
    3: "Praktiske, kreative eller faglige styrker:",
    4: "Hvor længe kan eleven typisk holde fokus?",
    5: "Behov for struktur, pauser og bevægelse:",
    6: "Arbejder eleven bedst alene, med én eller i en lille gruppe?",
    7: "Sanser eller belastninger, vi skal tage hensyn til:",
    8: "Modenhed og sikkerhed ved materialer eller værktøj:",
    9: "Hvor meget voksenstøtte kræves?",
    10: "Hvilket fagligt mål skal projektet støtte?",
    11: "Hvad er allerede prøvet, og hvad virkede eller virkede ikke?",
    12: "Din vurdering: Er PBL relevant nu — ja, nej eller usikkert?",
  };

  const label = profileLabels[fieldNumber];

  if (!label) {
    return "";
  }

  const escapeRegExp = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const currentMarker =
    `(?:^|\\s)${fieldNumber}\\.\\s*${escapeRegExp(label)}\\s*:?\\s*`;

  const nextLabel = profileLabels[fieldNumber + 1];
  const nextMarker = nextLabel
    ? `(?=\\s+${fieldNumber + 1}\\.\\s*${escapeRegExp(nextLabel)}\\s*:?)`
    : "$";

  const match = String(profileText || "").match(
    new RegExp(`${currentMarker}([\\s\\S]*?)${nextMarker}`, "i")
  );

  return match ? match[1].trim() : "";
}

function getPblProjectsForDynamicAssessment() {
  const filePath = path.join(
    process.cwd(),
    "data",
    "CDA_PBL_Projects.json"
  );

  const data = readJsonFile(
    filePath,
    "data/CDA_PBL_Projects.json blev ikke fundet"
  );

  const projects = Array.isArray(data.projects)
    ? data.projects
    : [];

  const cleanIndexValue = (value, maxLength = null) => {
    const cleaned = String(value || "")
      .replace(/[|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return Number.isInteger(maxLength)
      ? cleaned.slice(0, maxLength)
      : cleaned;
  };

  const compactList = (value, limit = null) => {
    const items = Array.isArray(value) ? value : [];
    const selected = Number.isInteger(limit)
      ? items.slice(0, limit)
      : items;

    return selected
      .map((item) => cleanIndexValue(item))
      .filter(Boolean)
      .join(",");
  };

  const codeValue = (value, codes) => {
    const normalized = String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return codes[normalized] || cleanIndexValue(value);
  };

  const rows = projects.map((project) => [
    cleanIndexValue(project.id),
    cleanIndexValue(project.title),
    cleanIndexValue(project.description, 60),
    compactList(project.competencies, 2),
    compactList(project.diagnosis_match),
    compactList(project.stimuli_type),
    codeValue(project.social_exposure, {
      lav: "L",
      moderat: "M",
      gruppe: "G",
    }),
    codeValue(project.structure_need, {
      lav: "L",
      moderat: "M",
      hoj: "H",
    }),
    codeValue(project.level, {
      junior: "J",
      intermediate: "I",
      advanced: "A",
    }),
    cleanIndexValue(project.duration_suggestion, 35),
    compactList(project.career_alignment, 3),
    compactList(project.progression?.develops, 3),
    compactList(project.progression?.next_projects, 3),
  ].join("|"));

  return {
    version: data.version || null,
    projectCount: projects.length,
    indexText: [
      `VERSION:${cleanIndexValue(data.version)}`,
      "KOLONNER:id|titel|kort tema|kompetencer|diagnosematch|stimuli|social|struktur|niveau|varighed|mulige retninger|udvikler|næste projekter",
      "KODER:social L=lav M=moderat G=gruppe; struktur L=lav M=moderat H=høj; niveau J=junior I=intermediate A=advanced",
      ...rows,
    ].join("\n"),
  };
}

async function assessPblProfileDynamically(profileText, options = {}) {
  const openai = options.openai;
  const projectData = getPblProjectsForDynamicAssessment();

  const instructions = [
    "Du er CDA's dynamiske PBL-fagmotor.",
    "Foretag en samlet faglig vurdering af elevprofilen og det kompakte projektindex.",
    "Brug ingen point, vægte, faste særord, skjult facitliste eller diagnose som automatisk konklusion.",
    "Elevens egeninteresse er indgangen. Vurder derefter koncentration, arbejdsform, alder og modenhed, sikkerhed, støttebehov, social belastning, faglige mål og mulighed for realistiske microsteps.",
    "Første forslag skal have det stærkeste direkte interessematch. Andet forslag skal være en relevant naboretning eller udviklingsmulighed, ikke et tilfældigt alternativ.",
    "Projektet er en meningsfuld læringsvej. Ro kan opstå, men må aldrig være projektets formål eller vigtigste succesmål.",
    "Vælg kun projekt-id'er, der findes i det vedlagte projektindex.",
    "Vælg to forskellige eksisterende projekter, hvis begge er reelt fagligt egnede.",
    "Hvis projektindexet ikke indeholder to forsvarlige muligheder, skal status være no_suitable_match. Vælg ikke et tilfældigt projekt for at udfylde felterne.",
    "Begrundelserne skal være korte, konkrete og baseret på både elevprofilen og projektdata.",
    "CDA foreslår. Læreren guider. Eleven vælger med.",
  ].join("\n");

  const projectIndex = projectData.indexText;

  const input = [
    "ELEVPROFIL:",
    profileText,
    "",
    "KOMPAKT PBL-PROJEKTINDEX:",
    projectIndex,
  ].join("\n");

  console.log("CDA PBL inputmåling:", {
    project_count: projectData.projectCount,
    profile_chars: profileText.length,
    profile_bytes: Buffer.byteLength(profileText, "utf8"),
    instructions_chars: instructions.length,
    instructions_bytes: Buffer.byteLength(instructions, "utf8"),
    project_index_chars: projectIndex.length,
    project_index_bytes: Buffer.byteLength(projectIndex, "utf8"),
    complete_input_chars: input.length,
    complete_input_bytes: Buffer.byteLength(input, "utf8"),
  });

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input,
    max_output_tokens: 700,
    text: {
      format: {
        type: "json_schema",
        name: "cda_pbl_assessment",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["matched", "no_suitable_match"],
            },
            first_id: {
              type: "string",
            },
            second_id: {
              type: "string",
            },
            first_reason: {
              type: "string",
            },
            second_reason: {
              type: "string",
            },
            no_match_reason: {
              type: "string",
            },
          },
          required: [
            "status",
            "first_id",
            "second_id",
            "first_reason",
            "second_reason",
            "no_match_reason",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændig dynamisk PBL-vurdering");
  }

  const assessment = JSON.parse(response.output_text || "{}");

  if (assessment.status === "no_suitable_match") {
    return {
      assessment,
      response,
      first: null,
      second: null,
    };
  }

  const first = getPblProjectById(assessment.first_id);
  const second = getPblProjectById(assessment.second_id);

  if (
    !first ||
    !second ||
    String(first.id) === String(second.id)
  ) {
    throw new Error(
      "PBL-fagmotoren returnerede ugyldige eller ens projektvalg"
    );
  }

  return {
    assessment,
    response,
    first,
    second,
  };
}

function getStructuredPblProfile(profileText) {
  return {
    age_and_grade: extractProfileField(profileText, 1),
    interests: extractProfileField(profileText, 2),
    strengths: extractProfileField(profileText, 3),
    focus: extractProfileField(profileText, 4),
    structure_and_breaks: extractProfileField(profileText, 5),
    work_form: extractProfileField(profileText, 6),
    sensory_load: extractProfileField(profileText, 7),
    safety_and_maturity: extractProfileField(profileText, 8),
    adult_support: extractProfileField(profileText, 9),
    learning_goals: extractProfileField(profileText, 10),
    previous_attempts: extractProfileField(profileText, 11),
    pbl_relevance: extractProfileField(profileText, 12),
  };
}

async function createTailoredPblProject(
  profileText,
  rejectedProjects = [],
  options = {}
) {
  const openai = options.openai;
  const profile = getStructuredPblProfile(profileText);

  const rejected = rejectedProjects
    .filter(Boolean)
    .map((project) => ({
      id: project.id || null,
      title: project.title || null,
      subtitle: project.subtitle || null,
    }));

  const compactProfile = Object.fromEntries(
    Object.entries({
      age: profile.age_and_grade,
      interests: profile.interests,
      strengths: profile.strengths,
      focus: profile.focus,
      structure: profile.structure_and_breaks,
      work_form: profile.work_form,
      sensory_load: profile.sensory_load,
      safety: profile.safety_and_maturity,
      adult_support: profile.adult_support,
      learning_goals: profile.learning_goals,
      previous_attempts: profile.previous_attempts,
      pbl_relevance: profile.pbl_relevance,
    }).filter(([, value]) => String(value || "").trim())
  );

  const instructions = [
    "Du er CDA's dynamiske PBL-fagmotor.",
    "Begge eksisterende forslag er afvist.",
    "Skab ét nyt og tydeligt anderledes PBL-projekt ud fra elevprofilen som helhed.",
    "Brug ingen point, vægte, særord eller skjult facitliste.",
    "Tag hensyn til interesse, koncentration, arbejdsform, alder, sikkerhed, støttebehov, social belastning og faglige mål.",
    "Projektet skal kunne gennemføres i korte microsteps og give eleven medejerskab.",
    "Hold titel og tekstfelter korte. Skriv præcis 3 aktiviteter og 3 microsteps. Hvert listepunkt må højst være 12 ord.",
  ].join("\n");

  const input = JSON.stringify({
    profile: compactProfile,
    rejected_projects: rejected.map((project) => ({
      id: project.id,
      title: project.title,
    })),
  });

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    instructions,
    input,
    max_output_tokens: 850,
    text: {
      format: {
        type: "json_schema",
        name: "cda_tailored_pbl_project",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            subtitle: { type: "string" },
            description: { type: "string" },
            why_it_fits: { type: "string" },
            activities: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
            microsteps: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: [
            "title",
            "subtitle",
            "description",
            "why_it_fits",
            "activities",
            "microsteps",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    console.error("CDA tilpasset PBL-kald ufuldstændigt:", {
      status: response.status,
      incomplete_details: response.incomplete_details || null,
      output_item_types: Array.isArray(response.output)
        ? response.output.map((item) => item.type || null)
        : [],
      output_text_length: String(response.output_text || "").length,
      usage: response.usage || null,
    });

    throw new Error("Ufuldstændigt tilpasset PBL-projekt");
  }

  const generatedProject = JSON.parse(
    response.output_text || "{}"
  );

  return {
    project: {
      ...generatedProject,
      learning_integration: profile.learning_goals,
      safety_framework: profile.safety_and_maturity,
      adult_support: profile.adult_support,
    },
    response,
  };
}

function formatTailoredPblProject(project) {
  const activities = (project.activities || [])
    .map((item) => `- ${item}`)
    .join("\n");

  const microsteps = (project.microsteps || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return [
    `**Nyt tilpasset projekt: ${project.title}**`,
    project.subtitle ? `*${project.subtitle}*` : "",
    "",
    project.description || "",
    project.why_it_fits
      ? `\n**Hvorfor det passer:** ${project.why_it_fits}`
      : "",
    "",
    activities ? `Projektet kan begynde med:\n${activities}` : "",
    microsteps ? `\nFørste microsteps:\n${microsteps}` : "",
    project.learning_integration
      ? `\nDe faglige mål indbygges sådan: ${project.learning_integration}`
      : "",
    project.safety_framework
      ? `\nSikkerhedsramme: ${project.safety_framework}`
      : "",
    project.adult_support
      ? `\nVoksenstøtte: ${project.adult_support}`
      : "",
    "",
    "Projektet er skabt ud fra elevprofilen, men læreren og eleven skal stadig tilpasse og vælge det sammen.",
  ].filter(Boolean).join("\n");
}

function formatPblChoice(project, choiceNumber, profileText, reason = "") {
  const learningGoals = extractProfileField(profileText, 10);
  const safety = extractProfileField(profileText, 8);

  const activities = (project.activities || [])
    .slice(0, 3)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    `**Forslag ${choiceNumber}: ${project.title}**`,
    project.subtitle ? `*${project.subtitle}*` : "",
    "",
    project.description || "",
    reason ? `\n**Hvorfor det passer:** ${reason}` : "",
    "",
    activities ? `Projektet kan begynde med:\n${activities}` : "",
    learningGoals
      ? `\nDe faglige mål kan indbygges sådan: ${learningGoals}`
      : "",
    safety
      ? `\nSikkerhedsramme: ${safety}`
      : "",
    "",
    "Det er et forslag, ikke en beslutning. Tal med eleven om, hvad der virker spændende ved projektet.",
    choiceNumber === 1
      ? "Vil I vælge dette projekt, se forslag 2 eller tale om projektet først?"
      : "Vil I vælge dette projekt, gå tilbage til forslag 1 eller have CDA til at skabe et nyt projekt sammen med jer?"
  ].filter(Boolean).join("\n");
}

const PBL_PROFILE_FIELDS = [
  ["age_and_grade", "Alder og klassetrin"],
  ["interests", "Interesser og det eleven selv opsøger"],
  ["strengths", "Praktiske, kreative eller faglige styrker"],
  ["focus", "Hvor længe kan eleven typisk holde fokus"],
  ["structure_and_breaks", "Behov for struktur, pauser og bevægelse"],
  ["work_form", "Arbejder eleven bedst alene, med én eller i en lille gruppe"],
  ["sensory_load", "Sanser eller belastninger, vi skal tage hensyn til"],
  ["safety_and_maturity", "Modenhed og sikkerhed ved materialer eller værktøj"],
  ["adult_support", "Hvor meget voksenstøtte kræves"],
  ["learning_goals", "Hvilket fagligt mål skal projektet støtte"],
  ["previous_attempts", "Hvad er allerede prøvet, og hvad virkede eller virkede ikke"],
  ["pbl_relevance", "Din vurdering: Er PBL relevant nu - ja, nej eller usikkert"],
];

function encodePblState(prefix, data) {
  return `${prefix}:${Buffer.from(
    JSON.stringify(data),
    "utf8"
  ).toString("base64url")}`;
}

function decodePblState(value, prefix) {
  const text = String(value || "");
  const marker = `${prefix}:`;

  if (!text.startsWith(marker)) return null;

  try {
    return JSON.parse(
      Buffer.from(text.slice(marker.length), "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
}

function isAffirmativePblReply(value) {
  const text = normalizeReplyIntent(value);
  return /^(ja|ja tak|gerne|ok|okay|det gor vi|det gør vi|vaelg|vælg)$/.test(text) ||
    text.includes("vi vaelger") ||
    text.includes("vi vælger");
}

function isNegativePblReply(value) {
  const text = normalizeReplyIntent(value);
  return /^(nej|nej tak|ikke nu|ellers tak)$/.test(text);
}

function formatCanonicalPblProfile(profile = {}) {
  return PBL_PROFILE_FIELDS.map(
    ([key, label], index) => `${index + 1}. ${label}: ${safeString(profile[key]).trim()}`
  ).join("\n");
}

function compactActiveCaseContext(activeCaseContext) {
  if (!activeCaseContext) return "";
  return JSON.stringify(activeCaseContext).slice(0, 5000);
}

function getResponseUsage(response, phase) {
  const inputTokens = Number(response?.usage?.input_tokens || 0);
  const outputTokens = Number(response?.usage?.output_tokens || 0);
  return {
    phase,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: Number(
      response?.usage?.total_tokens || inputTokens + outputTokens
    ),
  };
}

async function assessPblIntake({
  openai,
  message,
  previousProfile = {},
  previousSource = "",
  activeCaseContext = null,
}) {
  const instructions = [
    "Du er CDA's PBL-intakemotor.",
    "Udtræk og sammenhold kun oplysninger, brugeren faktisk har givet.",
    "Interessen er altid indgangen til PBL. Gentag ikke spørgsmål, som allerede er besvaret.",
    "Før projektmatch skal du kende elevens alder eller klassetrin, den konkrete interesse, et fagligt læringsmål og nok om støtte/sikkerhed til at kunne starte forsvarligt.",
    "Hvis noget nødvendigt mangler, spørg kort efter højst to nært beslægtede oplysninger. Spørgsmålet skal lyde sikkert og fagligt, ikke tøvende.",
    "Når en interesse er kendt, skal next_question begynde med én kort sætning om, at PBL kan være en meningsfuld læringsvej gennem netop den interesse. Derefter stilles spørgsmålet.",
    "Fremstil aldrig PBL som parkering, aflastning eller en metode, der primært skal skabe ro.",
    "Brug status ready, når der er nok til et forsvarligt første forslag. Alt behøver ikke være udfyldt.",
    "Brug status not_ready kun når de givne oplysninger viser, at PBL ikke bør startes nu; manglende oplysninger giver needs_info.",
    "Et PBL-projekt er en lærings- og udviklingsvej, aldrig parkering eller blot et middel til ro.",
    "Svarfelterne på dansk og kort.",
  ].join("\n");

  const input = JSON.stringify({
    current_message: message,
    previous_profile: previousProfile,
    previous_user_information: previousSource,
    active_case_context: compactActiveCaseContext(activeCaseContext),
  });

  const profileProperties = Object.fromEntries(
    PBL_PROFILE_FIELDS.map(([key]) => [key, { type: "string" }])
  );

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions,
    input,
    max_output_tokens: 700,
    text: {
      format: {
        type: "json_schema",
        name: "cda_pbl_intake",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["needs_info", "ready", "not_ready"],
            },
            profile: {
              type: "object",
              properties: profileProperties,
              required: PBL_PROFILE_FIELDS.map(([key]) => key),
              additionalProperties: false,
            },
            missing_essential_fields: {
              type: "array",
              items: { type: "string" },
              maxItems: 4,
            },
            next_question: { type: "string" },
            not_ready_reason: { type: "string" },
          },
          required: [
            "status",
            "profile",
            "missing_essential_fields",
            "next_question",
            "not_ready_reason",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt PBL-intake");
  }

  const assessment = JSON.parse(response.output_text || "{}");
  if (assessment.status === "needs_info" && !assessment.next_question) {
    throw new Error("PBL-intake mangler næste spørgsmål");
  }

  return { assessment, response };
}

function formatNoPblMatch(reason) {
  return reason
    ? `Projektbanken har ikke et tilstrækkeligt godt match endnu. ${reason} Jeg vil hellere skabe et projekt sammen med jer end vælge et tilfældigt.`
    : "Projektbanken har ikke et tilstrækkeligt godt match endnu. Jeg vil hellere skabe et projekt sammen med jer end vælge et tilfældigt.";
}

async function createPblPilot(project, profileText, options = {}) {
  const openai = options.openai;
  const profile = getStructuredPblProfile(profileText);
  const instructions = [
    "Du er CDA's PBL-pilotmotor.",
    "Lav et konkret pilotforløb på præcis tre uger ud fra det valgte projekt, elevens interesse og elevprofilen.",
    "Interessen er indgangen; læring, udvikling, vedholdenhed og elevens oplevelse er målene.",
    "Integrer relevante skolefag i det praktiske projekt. Brug realistiske microsteps, der kan gøres mindre eller større undervejs.",
    "Ro må ikke være formål eller vigtigste succesmål. Projektet må gerne være aktivt, energisk og kræve støtte.",
    "Læreren vurderer engagement, læring, koncentration, vedholdenhed, støttebehov og trivsel efter tre uger.",
    "Bevar elevens medvalg. Ingen karriere- eller virksomhedsløfter i denne version.",
    "Skriv kort, konkret og på dansk.",
  ].join("\n");

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions,
    input: JSON.stringify({ project, profile }),
    max_output_tokens: 1500,
    text: {
      format: {
        type: "json_schema",
        name: "cda_pbl_three_week_pilot",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            purpose: { type: "string" },
            weeks: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  week: { type: "integer" },
                  learning_goal: { type: "string" },
                  microsteps: {
                    type: "array",
                    minItems: 3,
                    maxItems: 4,
                    items: { type: "string" },
                  },
                  subject_integration: {
                    type: "array",
                    minItems: 1,
                    maxItems: 4,
                    items: { type: "string" },
                  },
                  teacher_observes: {
                    type: "array",
                    minItems: 2,
                    maxItems: 4,
                    items: { type: "string" },
                  },
                },
                required: [
                  "week",
                  "learning_goal",
                  "microsteps",
                  "subject_integration",
                  "teacher_observes",
                ],
                additionalProperties: false,
              },
            },
            make_smaller: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: { type: "string" },
            },
            increase_challenge: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: { type: "string" },
            },
            student_choice: { type: "string" },
            final_evaluation: {
              type: "array",
              minItems: 4,
              maxItems: 6,
              items: { type: "string" },
            },
          },
          required: [
            "title",
            "purpose",
            "weeks",
            "make_smaller",
            "increase_challenge",
            "student_choice",
            "final_evaluation",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt PBL-pilotforløb");
  }

  return {
    pilot: JSON.parse(response.output_text || "{}"),
    response,
  };
}

function formatPblPilot(project, pilot) {
  const weeks = (pilot.weeks || []).map((week) => [
    `**Uge ${week.week}: ${week.learning_goal}**`,
    ...(week.microsteps || []).map((item) => `- ${item}`),
    `Fag: ${(week.subject_integration || []).join("; ")}`,
    `Læreren ser efter: ${(week.teacher_observes || []).join("; ")}`,
  ].join("\n")).join("\n\n");

  return [
    `**3-ugers pilot: ${pilot.title || project.title}**`,
    pilot.purpose || "",
    "",
    weeks,
    "",
    `**Elevens valg:** ${pilot.student_choice}`,
    `**Hvis trinnet er for stort:** ${(pilot.make_smaller || []).join("; ")}`,
    `**Hvis eleven er klar til mere:** ${(pilot.increase_challenge || []).join("; ")}`,
    "",
    `**Evaluér efter uge 3:** ${(pilot.final_evaluation || []).join("; ")}`,
    "",
    "Skriv kort, hvad læreren og eleven observerede efter piloten, så vurderer PBL-motoren næste trin.",
  ].filter(Boolean).join("\n");
}

function isPblEvaluationMessage(message) {
  const text = normalizeReplyIntent(message);
  return [
    "evaluer", "evaluering", "efter tre uger", "efter 3 uger",
    "fastholdt", "interessen holdt", "koncentration", "vedholdenhed",
    "det virkede", "det gik", "naeste trin", "næste trin", "fortsaette",
    "fortsætte", "justere",
  ].some((phrase) => text.includes(phrase));
}

async function evaluatePblPilot(state, observations, options = {}) {
  const project = state.projectId
    ? getPblProjectById(state.projectId)
    : state.customProject;

  if (!project) {
    throw new Error("PBL-pilotens projekt findes ikke");
  }
  const nextProjectIds = Array.isArray(project?.progression?.next_projects)
    ? project.progression.next_projects
    : [];
  const nextProjects = nextProjectIds
    .map((id) => getPblProjectById(id))
    .filter(Boolean)
    .map((item) => ({ id: item.id, title: item.title, level: item.level }));

  const response = await options.openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions: [
      "Du er CDA's PBL-evalueringsmotor.",
      "Vurder en afsluttet eller igangværende pilot ud fra lærerens og elevens konkrete observationer.",
      "Vurder engagement, læring, koncentration, vedholdenhed, støttebehov, trivsel og elevens perspektiv. Ro alene er ikke succes.",
      "Anbefal continue, increase_challenge, adjust_support eller pause_or_end.",
      "Gør næste trin elastisk og konkret. Et vanskeligt forløb betyder, at match, ramme eller støtte skal undersøges; det er ikke en dom over eleven.",
      "Brug kun et anbefalet projekt-id, hvis det findes blandt de vedlagte næste projekter. Ellers tom streng.",
      "Skriv sikkert, fagligt og kort på dansk.",
    ].join("\n"),
    input: JSON.stringify({
      project,
      pilot_title: state.pilotTitle,
      profile: getStructuredPblProfile(state.profile),
      observations,
      possible_next_projects: nextProjects,
    }),
    max_output_tokens: 750,
    text: {
      format: {
        type: "json_schema",
        name: "cda_pbl_pilot_evaluation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "continue",
                "increase_challenge",
                "adjust_support",
                "pause_or_end",
              ],
            },
            evidence: { type: "string" },
            professional_assessment: { type: "string" },
            next_step: { type: "string" },
            microsteps: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string" },
            },
            recommended_project_id: { type: "string" },
          },
          required: [
            "status",
            "evidence",
            "professional_assessment",
            "next_step",
            "microsteps",
            "recommended_project_id",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændig PBL-evaluering");
  }

  const evaluation = JSON.parse(response.output_text || "{}");
  const recommendedProject = nextProjects.find(
    (item) => String(item.id) === String(evaluation.recommended_project_id)
  );

  return { evaluation, recommendedProject, response };
}

function formatPblEvaluation(evaluation, recommendedProject) {
  return [
    "**PBL-evaluering**",
    evaluation.evidence,
    `**Faglig vurdering:** ${evaluation.professional_assessment}`,
    `**Næste trin:** ${evaluation.next_step}`,
    ...(evaluation.microsteps || []).map((item) => `- ${item}`),
    recommendedProject
      ? `Mulig næste udfordring fra projektbanken: **${recommendedProject.title}**.`
      : "",
    "Læreren og eleven vælger sammen, om trinnet skal fastholdes, gøres mindre eller udvides.",
  ].filter(Boolean).join("\n\n");
}

function buildPblResult({ reply, pendingAction = null, calls = [], tools, debug }) {
  return {
    reply,
    pendingAction,
    model: calls.length ? "gpt-5.4-mini" : "local",
    usage: calls.map((call, index) => ({
      call: index + 1,
      ...getResponseUsage(call.response, call.phase),
      tools_returned_to_model: [],
    })),
    usedTools: tools,
    toolDebug: debug,
    usedDataSources: ["data/CDA_PBL_Projects.json"],
  };
}

async function matchPblProjects(profile, options) {
  const profileText = formatCanonicalPblProfile(profile);
  const result = await assessPblProfileDynamically(profileText, options);

  if (result.assessment.status === "no_suitable_match") {
    const tailored = await createTailoredPblProject(profileText, [], options);
    const state = encodePblChoiceState({
      firstId: null,
      secondId: null,
      firstReason: "",
      secondReason: "",
      profile: profileText,
      shown: 3,
      customProject: tailored.project,
    });

    return buildPblResult({
      reply: [
        formatNoPblMatch(result.assessment.no_match_reason),
        "",
        formatTailoredPblProject(tailored.project),
        "",
        "Vil I vælge dette projekt eller tale om det først?",
      ].join("\n"),
      pendingAction: state,
      calls: [
        { response: result.response, phase: "pbl_project_match" },
        { response: tailored.response, phase: "pbl_tailored_project" },
      ],
      tools: ["pblEngineV1"],
      debug: [{ action: "create_project_after_no_suitable_bank_match" }],
    });
  }

  const state = encodePblChoiceState({
    firstId: result.first.id,
    secondId: result.second.id,
    firstReason: result.assessment.first_reason,
    secondReason: result.assessment.second_reason,
    profile: profileText,
    shown: 1,
  });

  return buildPblResult({
    reply: formatPblChoice(
      result.first,
      1,
      profileText,
      result.assessment.first_reason
    ),
    pendingAction: state,
    calls: [{ response: result.response, phase: "pbl_project_match" }],
    tools: ["pblEngineV1"],
    debug: [{
      action: "show_first_project",
      first_choice: result.first.id,
      second_choice: result.second.id,
    }],
  });
}

async function runPblFlow({
  openai,
  message,
  pendingAction,
  activeCaseContext = null,
}) {
  if (pendingAction === "pbl_profile") {
    if (isAffirmativePblReply(message)) {
      return buildPblResult({
        reply: getPblProfileTemplate(),
        pendingAction: "pbl_profile_input",
        tools: ["pblEngineV1"],
        debug: [{ action: "show_full_profile_template" }],
      });
    }
    if (isNegativePblReply(message)) {
      return buildPblResult({
        reply: "Helt fint. Vi starter først PBL, når det giver mening for jer.",
        tools: ["pblEngineV1"],
        debug: [{ action: "decline_full_profile_template" }],
      });
    }
  }

  if (pendingAction === "pbl_profile_input") {
    const intake = await assessPblIntake({ openai, message, activeCaseContext });
    if (intake.assessment.status === "needs_info") {
      return buildPblResult({
        reply: intake.assessment.next_question,
        pendingAction: encodePblState("pbl_intake", {
          profile: intake.assessment.profile,
          source: message,
        }),
        calls: [{ response: intake.response, phase: "pbl_intake" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "ask_missing_profile_information" }],
      });
    }
    if (intake.assessment.status === "not_ready") {
      return buildPblResult({
        reply: intake.assessment.not_ready_reason,
        calls: [{ response: intake.response, phase: "pbl_intake" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "pbl_not_ready" }],
      });
    }
    const matched = await matchPblProjects(intake.assessment.profile, { openai });
    matched.usage.unshift({
      call: 1,
      ...getResponseUsage(intake.response, "pbl_intake"),
      tools_returned_to_model: [],
    });
    matched.usage = matched.usage.map((item, index) => ({ ...item, call: index + 1 }));
    return matched;
  }

  const intakeState = decodePblState(pendingAction, "pbl_intake");
  if (intakeState) {
    const intake = await assessPblIntake({
      openai,
      message,
      previousProfile: intakeState.profile,
      previousSource: intakeState.source,
      activeCaseContext,
    });
    const source = [intakeState.source, message].filter(Boolean).join("\n");
    if (intake.assessment.status === "needs_info") {
      return buildPblResult({
        reply: intake.assessment.next_question,
        pendingAction: encodePblState("pbl_intake", {
          profile: intake.assessment.profile,
          source,
        }),
        calls: [{ response: intake.response, phase: "pbl_intake_followup" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "ask_next_missing_profile_information" }],
      });
    }
    if (intake.assessment.status === "not_ready") {
      return buildPblResult({
        reply: intake.assessment.not_ready_reason,
        calls: [{ response: intake.response, phase: "pbl_intake_followup" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "pbl_not_ready" }],
      });
    }
    const matched = await matchPblProjects(intake.assessment.profile, { openai });
    matched.usage.unshift({
      call: 1,
      ...getResponseUsage(intake.response, "pbl_intake_followup"),
      tools_returned_to_model: [],
    });
    matched.usage = matched.usage.map((item, index) => ({ ...item, call: index + 1 }));
    return matched;
  }

  const choiceState = decodePblChoiceState(pendingAction);
  if (choiceState) {
    const normalized = normalizeReplyIntent(message);
    const firstProject = getPblProjectById(choiceState.firstId);
    const secondProject = getPblProjectById(choiceState.secondId);
    const wantsFirst = normalized.includes("valg 1") ||
      normalized.includes("forslag 1") || normalized.includes("forste") ||
      normalized.includes("første") || normalized.includes("tilbage");
    const wantsSecond = normalized.includes("valg 2") ||
      normalized.includes("forslag 2") || normalized.includes("nummer 2") ||
      normalized.includes("andet projekt") ||
      (choiceState.shown !== 2 && isNegativePblReply(message));
    const wantsCustom = choiceState.shown === 2 && (
      isNegativePblReply(message) || normalized.includes("nyt projekt") ||
      normalized.includes("skab et nyt") || normalized.includes("tilpasset projekt")
    );

    if (wantsCustom) {
      const tailored = await createTailoredPblProject(
        choiceState.profile,
        [firstProject, secondProject],
        { openai }
      );
      const state = encodePblChoiceState({
        ...choiceState,
        shown: 3,
        customProject: tailored.project,
      });
      return buildPblResult({
        reply: `${formatTailoredPblProject(tailored.project)}\n\nVil I vælge dette projekt eller tale om det først?`,
        pendingAction: state,
        calls: [{ response: tailored.response, phase: "pbl_tailored_project" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "create_tailored_project" }],
      });
    }

    if (wantsFirst && firstProject) {
      return buildPblResult({
        reply: formatPblChoice(firstProject, 1, choiceState.profile, choiceState.firstReason),
        pendingAction: encodePblChoiceState({ ...choiceState, shown: 1 }),
        tools: ["pblEngineV1"],
        debug: [{ action: "return_to_first_project", project_id: firstProject.id }],
      });
    }

    if (wantsSecond && secondProject) {
      return buildPblResult({
        reply: formatPblChoice(secondProject, 2, choiceState.profile, choiceState.secondReason),
        pendingAction: encodePblChoiceState({ ...choiceState, shown: 2 }),
        tools: ["pblEngineV1"],
        debug: [{ action: "show_second_project", project_id: secondProject.id }],
      });
    }

    if (isAffirmativePblReply(message)) {
      const selectedProject = choiceState.shown === 3
        ? choiceState.customProject
        : choiceState.shown === 2 ? secondProject : firstProject;
      if (!selectedProject) throw new Error("Det valgte PBL-projekt findes ikke");
      const pilotResult = await createPblPilot(
        selectedProject,
        choiceState.profile,
        { openai }
      );
      return buildPblResult({
        reply: formatPblPilot(selectedProject, pilotResult.pilot),
        pendingAction: encodePblState("pbl_pilot", {
          projectId: selectedProject.id || null,
          customProject: selectedProject.id ? null : selectedProject,
          profile: choiceState.profile,
          pilotTitle: pilotResult.pilot.title,
        }),
        calls: [{ response: pilotResult.response, phase: "pbl_three_week_pilot" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "create_three_week_pilot", project_id: selectedProject.id || null }],
      });
    }
  }

  const pilotState = decodePblState(pendingAction, "pbl_pilot");
  if (pilotState && isPblEvaluationMessage(message)) {
    const result = await evaluatePblPilot(pilotState, message, { openai });
    return buildPblResult({
      reply: formatPblEvaluation(result.evaluation, result.recommendedProject),
      pendingAction,
      calls: [{ response: result.response, phase: "pbl_pilot_evaluation" }],
      tools: ["pblEngineV1"],
      debug: [{
        action: "evaluate_pilot",
        status: result.evaluation.status,
        recommended_project_id: result.recommendedProject?.id || null,
      }],
    });
  }

  const normalized = normalizeReplyIntent(message);
  const asksForFullProfile = normalized.includes("fuld elevprofil") ||
    normalized.includes("hele elevprofilen") ||
    normalized.includes("profilskabelon") || normalized === "vis profil";
  if (asksForFullProfile) {
    return buildPblResult({
      reply: getPblProfileTemplate(),
      pendingAction: "pbl_profile_input",
      tools: ["pblEngineV1"],
      debug: [{ action: "show_full_profile_template" }],
    });
  }

  if (isConcreteStudentPblRequest(message)) {
    const intake = await assessPblIntake({
      openai,
      message,
      activeCaseContext,
    });
    if (intake.assessment.status === "needs_info") {
      return buildPblResult({
        reply: intake.assessment.next_question,
        pendingAction: encodePblState("pbl_intake", {
          profile: intake.assessment.profile,
          source: message,
        }),
        calls: [{ response: intake.response, phase: "pbl_intake" }],
        tools: ["pblEngineV1"],
        debug: [{
          action: "ask_missing_profile_information",
          missing: intake.assessment.missing_essential_fields,
        }],
      });
    }
    if (intake.assessment.status === "not_ready") {
      return buildPblResult({
        reply: intake.assessment.not_ready_reason,
        calls: [{ response: intake.response, phase: "pbl_intake" }],
        tools: ["pblEngineV1"],
        debug: [{ action: "pbl_not_ready" }],
      });
    }
    const matched = await matchPblProjects(intake.assessment.profile, { openai });
    matched.usage.unshift({
      call: 1,
      ...getResponseUsage(intake.response, "pbl_intake"),
      tools_returned_to_model: [],
    });
    matched.usage = matched.usage.map((item, index) => ({ ...item, call: index + 1 }));
    return matched;
  }

  return null;
}


function isDirectPblLibraryRequest(message) {
  const text = normalizeReplyIntent(message);

  return (
    /\bpbl[_ -]?\d+\b/i.test(String(message || "")) ||
    text.includes("projektbank") ||
    text.includes("projekt bibliotek") ||
    text.includes("projektbibliotek") ||
    text.includes("vis projektet") ||
    text.includes("hent projektet") ||
    text.includes("bike repair workshop")
  );
}

function isConcreteStudentPblRequest(message) {
  const text = normalizeReplyIntent(message);

  const mentionsStudent = [
    "elev",
    "barn",
    "dreng",
    "pige",
    "han",
    "hun"
  ].some((word) => text.includes(word));

  const requestsProject = [
    "pbl",
    "projektbaseret laering",
    "projektbaseret læring",
    "foresla et projekt",
    "foreslå et projekt",
    "find et projekt",
    "lav et projekt"
  ].some((phrase) => text.includes(phrase));

  return (
    mentionsStudent &&
    requestsProject &&
    !isDirectPblLibraryRequest(message)
  );
}

export {
  assessPblProfileDynamically,
  createTailoredPblProject,
  decodePblChoiceState,
  encodePblChoiceState,
  formatPblChoice,
  formatTailoredPblProject,
  getPblProfileTemplate,
  getPblProjectById,
  getPblProjects,
  getPblProjectsForDynamicAssessment,
  isConcreteStudentPblRequest,
  isDirectPblLibraryRequest,
  runPblFlow,
};
