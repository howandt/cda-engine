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
  ].join("|"));

  return {
    version: data.version || null,
    projectCount: projects.length,
    indexText: [
      `VERSION:${cleanIndexValue(data.version)}`,
      "KOLONNER:id|titel|kort tema|kompetencer|diagnosematch|stimuli|social|struktur|niveau",
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
    "Vurder især elevens egeninteresse, koncentration, arbejdsform, alder og modenhed, sikkerhed, støttebehov, social belastning, faglige mål og mulighed for realistiske microsteps.",
    "Et direkte interessematch er vigtigt, men skal altid vurderes sammen med resten af profilen.",
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
};
