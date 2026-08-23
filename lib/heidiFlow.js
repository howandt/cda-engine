import fs from "fs";
import path from "path";
import { getEmotionSignals } from "./emotionEngine.js";
import { findLocalPblSignals } from "./pblEngine.js";

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("HeidiFlow kunne ikke læse JSON:", filePath, error.message);
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value, maxLength = 900) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanHeidiOutputFormatting(value) {
  // 24A.4: CDA-frontenden viser nogle gange markdown-lister råt.
  // Derfor bruger HeidiFlow bullets i stedet for nummererede lister,
  // så brugeren ikke får "1. 1. 1." i svaret.
  return String(value || "")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function hasPriorActiveCaseContext(context) {
  // Frontend sender altid den aktuelle besked som last_user_message.
  // Til diagnoseopfølgning må vi derfor kun betragte sagen som "aktiv",
  // hvis der findes tidligere samtale-/casespor ud over den aktuelle besked.
  return Boolean(
    context?.active &&
      (
        context.summary ||
        context.known_context ||
        context.last_heidi_reply ||
        context.last_guidance_summary ||
        (Array.isArray(context.used_data_sources) && context.used_data_sources.length > 0)
      )
  );
}

function combinedCaseText(message, activeCaseContext) {
  return [
    activeCaseContext?.summary,
    activeCaseContext?.known_context,
    activeCaseContext?.last_user_message,
    activeCaseContext?.last_heidi_reply,
    activeCaseContext?.last_guidance_summary,
    message,
  ]
    .filter(Boolean)
    .map((item) => String(item))
    .join("\n");
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

function isExplicitTemplateRequest(message) {
  const text = normalizeText(message);

  if (!text) return false;

  const directCommands = [
    "lav",
    "vis",
    "hent",
    "find",
    "aabn",
    "åbn",
    "giv mig",
    "udfyld",
    "opret",
    "skriv",
  ];

  const templateWords = [
    "skabelon",
    "template",
    "guide",
    "kort",
    "pausekort",
    "trafiklys",
    "handleplan",
    "stoetteplan",
    "støtteplan",
    "skema",
    "dagsplan",
    "ugeplan",
    "plan",
  ];

  const bankRequests = [
    "skabelonbank",
    "templatebank",
    "hvilke skabeloner",
    "hvilke templates",
    "vis alle skabeloner",
    "oversigt over skabeloner",
  ];

  if (includesAny(text, bankRequests)) return true;

  const hasCommand = directCommands.some((command) => text.startsWith(normalizeText(command)) || text.includes(` ${normalizeText(command)} `));
  const hasTemplateWord = includesAny(text, templateWords);

  return hasCommand && hasTemplateWord;
}


function isHeidiTemplateBuildRequest(message) {
  const text = normalizeText(message);
  if (!text) return false;

  const buildCommands = [
    "lav",
    "skriv",
    "opret",
    "udfyld",
    "gør klar",
    "goer klar",
    "gør den klar",
    "goer den klar",
  ];

  const templateTitles = [
    "stoette under belastning",
    "støtte under belastning",
    "individuel overgangsaftale",
    "overgangsaftale",
    "tal til ro",
    "voksenkommunikation",
    "tal til ro og voksenkommunikation",
    "elevens kort",
    "elevkort",
    "pausekort",
    "trafiklys kort",
    "trafiklys-kort",
    "visuel mini plan",
    "visuel mini-plan",
    "handleplan",
    "team version",
    "teamversion",
    "forældre version",
    "foraeldre version",
    "elev version",
    "elevversion",
  ];

  const hasBuildCommand = buildCommands.some((command) => text.startsWith(normalizeText(command)) || text.includes(` ${normalizeText(command)} `));
  return hasBuildCommand && includesAny(text, templateTitles);
}

function isCaseContinuationLike(message) {
  const text = normalizeText(message);

  if (!text) return false;

  return includesAny(text, [
    "jeg har proevet",
    "jeg har prøvet",
    "det virker ikke",
    "det virkede ikke",
    "han naegter",
    "hun naegter",
    "han nægter",
    "hun nægter",
    "bliver mere vred",
    "bliver endnu mere vred",
    "stadig",
    "hvad goer jeg saa",
    "hvad gør jeg så",
    "jeg bliver irriteret",
    "daarlig samvittighed",
    "dårlig samvittighed",
  ]);
}

function isDeepInsightRequest(message) {
  const text = normalizeText(message);

  if (!text) return false;

  return includesAny(text, [
    "dybdegaende",
    "dybdegående",
    "dybere indsigt",
    "uddyb",
    "forklar mere",
    "grundig info",
    "grundig forklaring",
    "detaljeret",
    "mere viden",
    "hvad er adhd",
    "hvad er autisme",
    "hvad er asf",
    "hvad er angst",
  ]);
}

function isTeacherAffectRequest(message) {
  const text = normalizeText(message);

  return includesAny(text, [
    "jeg bliver irriteret",
    "jeg mister taalmodigheden",
    "jeg mister tålmodigheden",
    "daarlig samvittighed",
    "dårlig samvittighed",
    "mister styringen",
    "jeg bliver vred",
    "jeg bliver frustreret",
  ]);
}

function isDoesNotWorkFollowup(message) {
  const text = normalizeText(message);

  return includesAny(text, [
    "jeg har proevet",
    "jeg har prøvet",
    "det virker ikke",
    "det virkede ikke",
    "han naegter",
    "hun naegter",
    "han nægter",
    "hun nægter",
    "bliver mere vred",
    "bliver endnu mere vred",
  ]);
}

function resolveHeidiResponseStyle(message, responseStyle) {
  if (isDeepInsightRequest(message)) return "Dyb";
  return responseStyle || "Kort";
}

export function shouldBlockTemplateAutoRouting({ message, activeCaseContext = null } = {}) {
  if (isExplicitTemplateRequest(message)) return false;

  // 24A.1: I almindelig Heidi-samtale må ord som "pause", "kort" eller
  // "føler" ikke åbne skabelonbanken. Skabeloner må kun åbnes ved klart kald.
  return hasActiveCaseContext(activeCaseContext) || isCaseContinuationLike(message);
}

function loadSemanticSignals(message, activeCaseContext) {
  const semantic = readJsonIfExists(
    path.join(process.cwd(), "public", "data", "semantic_engine.json"),
    {}
  );

  const text = normalizeText(combinedCaseText(message, activeCaseContext));
  const matches = [];

  for (const [key, values] of Object.entries(semantic.synonyms || {})) {
    const candidates = [key, ...(Array.isArray(values) ? values : [])];
    const hit = candidates.find((candidate) => text.includes(normalizeText(candidate)));
    if (hit) {
      matches.push({ type: "synonym", key, matched: hit });
    }
  }

  for (const [theme, words] of Object.entries(semantic.themes || {})) {
    const hitWords = (Array.isArray(words) ? words : [])
      .filter((word) => text.includes(normalizeText(word)))
      .slice(0, 5);
    if (hitWords.length > 0) {
      matches.push({ type: "theme", key: theme, matched: hitWords });
    }
  }

  for (const [emotion, words] of Object.entries(semantic.emotions || {})) {
    const hitWords = (Array.isArray(words) ? words : [])
      .filter((word) => text.includes(normalizeText(word)))
      .slice(0, 5);
    if (hitWords.length > 0) {
      matches.push({ type: "emotion", key: emotion, matched: hitWords });
    }
  }

  return matches.slice(0, 12);
}

function loadDiagnosisIndex() {
  return readJsonIfExists(
    path.join(process.cwd(), "data", "diagnoser", "index.json"),
    []
  );
}

function diagnosisAliases(meta) {
  const aliases = [meta?.id, meta?.navn, String(meta?.fil || "").replace(/\.json$/i, "")];

  const id = normalizeText(meta?.id);
  if (id === "adhd") aliases.push("attention deficit hyperactivity disorder", "opmaerksomhedsforstyrrelse", "hyperaktivitet", "impulsivitet");
  if (id === "autisme") aliases.push("autismespektrum", "asperger", "asf", "asd", "autism");
  if (id === "angst") aliases.push("angstlidelse", "anxiety", "bekymring", "frygt");
  if (id === "soevnforstyrrelser") aliases.push("soevn", "søvn", "soevnproblemer", "søvnproblemer");

  return aliases.filter(Boolean);
}

function findDiagnosisMatches(message, activeCaseContext, { explicitOnly = false } = {}) {
  const index = loadDiagnosisIndex();
  const messageText = normalizeText(message);
  const caseText = normalizeText(combinedCaseText(message, activeCaseContext));
  const sourceText = explicitOnly ? messageText : caseText;

  return index
    .map((meta) => {
      const hit = diagnosisAliases(meta).find((alias) => sourceText.includes(normalizeText(alias)));
      return hit ? { meta, matched: hit } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function loadDiagnosisSnippet(meta, responseStyle) {
  if (!meta?.fil) return null;

  const data = readJsonIfExists(
    path.join(process.cwd(), "data", "diagnoser", meta.fil),
    null
  );

  if (!data) return null;

  return {
    id: data.id || meta.id || null,
    navn: data.navn || meta.navn || null,
    fuld_navn: data.fuld_navn || null,
    kort_visning: data.kort_visning || null,
    lang_visning:
      responseStyle === "Dyb"
        ? {
            intro: data.lang_visning?.intro || null,
            hvad_er: data.lang_visning?.hvad_er_adhd || data.lang_visning?.hvad_er_autisme || data.lang_visning?.hvad_er_angst || null,
            definition_og_typiske_symptomer: data.lang_visning?.definition_og_typiske_symptomer || null,
            naar_adfaerden_bliver_misforstaaet: data.lang_visning?.naar_adfaerden_bliver_misforstaaet || null,
            i_skole_og_laering: data.lang_visning?.i_skole_og_laering || null,
            myter_og_misforstaaelser: data.lang_visning?.myter_og_misforstaaelser || null,
          }
        : null,
  };
}

function buildDiagnosisContext(message, activeCaseContext, responseStyle) {
  const explicitMatches = findDiagnosisMatches(message, activeCaseContext, { explicitOnly: true });
  const matches = explicitMatches.length > 0
    ? explicitMatches
    : findDiagnosisMatches(message, activeCaseContext, { explicitOnly: false }).slice(0, 2);

  return matches
    .map(({ meta, matched }) => ({
      matched,
      data: loadDiagnosisSnippet(meta, responseStyle),
    }))
    .filter((item) => item.data);
}

export function isContextualDiagnosisFollowup({ message, activeCaseContext = null } = {}) {
  if (!hasPriorActiveCaseContext(activeCaseContext)) return false;

  const text = normalizeText(message);
  if (!text || text.length > 120) return false;

  const matches = findDiagnosisMatches(message, null, { explicitOnly: true });
  if (matches.length !== 1) return false;

  const diagnosisName = normalizeText(matches[0].meta?.navn || matches[0].meta?.id || "");
  const diagnosisId = normalizeText(matches[0].meta?.id || "");

  return text === diagnosisName || text === diagnosisId || text.includes(diagnosisName) || text.includes(diagnosisId);
}


function normalizeTemplateTitle(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTemplateCandidate(candidate, text) {
  const terms = [
    candidate.id,
    candidate.title,
    candidate.description,
    ...(Array.isArray(candidate.keywords) ? candidate.keywords : []),
    ...(Array.isArray(candidate.tags) ? candidate.tags : []),
    ...(Array.isArray(candidate.diagnoses) ? candidate.diagnoses : []),
    ...(Array.isArray(candidate.search_keywords) ? candidate.search_keywords : []),
  ]
    .filter(Boolean)
    .map(normalizeText)
    .filter(Boolean);

  let score = 0;
  const matched = [];

  for (const term of terms) {
    if (!term) continue;
    if (text.includes(term)) {
      score += term.length > 8 ? 3 : 2;
      matched.push(term);
    }
  }

  // Praktiske CDA-genveje: match almindelige klasseproblemer til relevante
  // skabelonforslag uden at åbne selve skabelonen.
  const title = normalizeText(candidate.title);
  const id = normalizeText(candidate.id);
  const combined = `${title} ${id}`;

  const hasUroRegulering = includesAny(text, [
    "uro", "urolig", "vred", "vrede", "affekt", "regulering", "nedlukning", "shutdown", "pause", "pauser", "overbelastning"
  ]);
  const hasStrukturSkift = includesAny(text, [
    "skift", "overgang", "overgange", "struktur", "forudsigelig", "dagsplan", "rutine", "rutiner"
  ]);
  const hasMotivationMaal = includesAny(text, [
    "maal", "mål", "beloenning", "belønning", "motivation", "ros", "delmaal", "delmål", "stjerner"
  ]);
  const hasTeamPpr = includesAny(text, [
    "ppr", "akt", "team", "observation", "observer", "indsats", "moenster", "mønster"
  ]);
  const hasSkoleHjem = includesAny(text, [
    "hjem", "foraeldre", "forældre", "skole hjem", "kontakt", "kommunikation"
  ]);

  if (hasUroRegulering && includesAny(combined, ["foelelser", "følelser", "regulering", "trafiklys", "voksenkommunikation"])) score += 8;
  if (hasStrukturSkift && includesAny(combined, ["visuel dagsplan", "overgange", "skift", "struktur"])) score += 7;
  if (hasMotivationMaal && includesAny(combined, ["anerkendelse", "motivation", "maal", "mål", "uge", "delmaal", "delmål"])) score += 6;
  if (hasTeamPpr && includesAny(combined, ["observation", "indsats", "kommunikationslog"])) score += 6;
  if (hasSkoleHjem && includesAny(combined, ["kommunikationslog", "skole hjem", "voksenkommunikation"])) score += 6;

  return { score, matched: matched.slice(0, 5) };
}

function flattenTemplateCandidatesFromFiles(data) {
  const candidates = [];

  for (const category of Array.isArray(data?.categories) ? data.categories : []) {
    candidates.push({
      id: category.id,
      title: category.title,
      description: category.description,
      keywords: category.keywords,
      source: "category",
    });

    for (const file of Array.isArray(category.files) ? category.files : []) {
      candidates.push({
        id: file.id,
        title: file.title,
        description: category.description,
        keywords: [...(Array.isArray(category.keywords) ? category.keywords : []), ...(Array.isArray(file.keywords) ? file.keywords : [])],
        source: "file",
        category_title: category.title,
      });
    }
  }

  for (const item of Array.isArray(data?.standalone) ? data.standalone : []) {
    candidates.push({
      id: item.id,
      title: item.title,
      description: item.description,
      keywords: item.keywords,
      source: "standalone",
    });
  }

  return candidates;
}

function flattenTemplateCandidatesFromDatabase(data) {
  const templates = data?.template_database?.templates;
  if (!Array.isArray(templates)) return [];

  return templates.map((template) => ({
    id: template.id,
    title: template.title,
    description: template.content?.description || template.content?.purpose || null,
    keywords: template.search_keywords,
    tags: template.tags,
    diagnoses: template.diagnoses,
    source: "template_database",
  }));
}

function loadTemplateSuggestions(message, activeCaseContext) {
  const templateFiles = readJsonIfExists(
    path.join(process.cwd(), "data", "CDA_TemplateFiles.json"),
    {}
  );
  const text = normalizeText(combinedCaseText(message, activeCaseContext));

  // 24A.3 bruger først den rene template-filstruktur. Den gamle
  // CDA_Templates-database kan indeholde brede diagnose-tags, som giver
  // for løse forslag. Derfor henter vi forslag fra CDA_TemplateFiles.json her.
  const candidates = [
    ...flattenTemplateCandidatesFromFiles(templateFiles),
  ];

  const scored = candidates
    .map((candidate) => {
      const result = scoreTemplateCandidate(candidate, text);
      return { ...candidate, score: result.score, matched: result.matched };
    })
    .filter((candidate) => candidate.score > 0)
    .filter((candidate) => {
      // Undgå brede hjælpefiler som forslag, når der findes mere konkrete skabeloner.
      const title = normalizeText(candidate.title);
      if (candidate.source === "file" && includesAny(title, ["overblik", "inspiration", "evaluering"])) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const seen = new Set();
  return scored
    .filter((candidate) => {
      const key = normalizeText(candidate.category_title || candidate.title || candidate.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((candidate) => ({
      title: normalizeTemplateTitle(candidate.title || candidate.id),
      category: candidate.category_title || null,
      description: compactText(candidate.description, 160),
      matched: candidate.matched,
      note: "Forslag kun. Åbn ikke skabelonindhold uden tydeligt bruger-kald.",
    }));
}

function buildHeidiFlowDataContext({ message, activeCaseContext, responseStyle }) {
  const semanticSignals = loadSemanticSignals(message, activeCaseContext);
  const emotionSignals = getEmotionSignals({ message });
  const diagnosisContext = buildDiagnosisContext(message, activeCaseContext, responseStyle);
  const templateSuggestions = loadTemplateSuggestions(message, activeCaseContext);
  const pblSuggestions = findLocalPblSignals(message, null);

  return {
    semantic_signals: semanticSignals,
    emotion_signals: emotionSignals,
    diagnosis_context: diagnosisContext,
    template_suggestions: templateSuggestions,
    pbl_suggestions: pblSuggestions,
  };
}

function buildHeidiFlowInstructions({
  heidiPrompt,
  audienceInstructions,
  activeCaseInstructions,
  responseStyle,
  role,
  mode,
  message,
  activeCaseContext,
}) {
  const styleInstruction =
    responseStyle === "Kort"
      ? "Svar kort: først forståelse, derefter højst 3 konkrete handlinger."
      : responseStyle === "Dyb"
        ? "Giv dybere lærerrettet indsigt med det samme. Skriv stadig som Heidi i samtale — ikke som en klinisk manual eller et bogkapitel."
        : "Giv kort forklaring og konkrete næste skridt.";

  const heidiShapeInstructions = [
    "24A.5 HEIDISTEMME — SKABELONKALD KLAR TIL BRUG",
    "Svar på brugerens konkrete situation, ikke kun på emnet. Brug aktiv sag som samtalehukommelse.",
    "Ved almindelig lærerhjælp: start med én kort faglig omramning, vis barnets mulige perspektiv og den voksnes perspektiv, og giv derefter konkrete handlinger.",
    "Brug gerne korte overskrifter som: Barnets perspektiv, Dit perspektiv, Gør i morgen, Kort sætning til eleven. Brug dem kun når de hjælper svaret.",
    "Giv konkrete sætninger læreren kan sige til barnet. De skal være korte, rolige og værdige.",
    "Hvis brugeren siger at pauser/aftaler ikke virker: forklar at aftalen eller påmindelsen kan være blevet et krav/trigger. Giv ny strategi: færre ord, ingen påmindelse midt i affekt, diskret tegn/valg, værdig pause og aftale når barnet er roligt.",
    "Hvis læreren beskriver irritation, skyld eller manglende styring: giv voksenregulering, aflast forkert skyld, fasthold ansvar og medtag relationel reparation bagefter.",
    "Ved dybdegående diagnose-/sporønske: giv dybden nu. Afslut ikke med at tilbyde den. Forklar: hvad det er, hvordan det ses i skolen, barnets perspektiv, lærerens perspektiv, eksekutive funktioner, typiske misforståelser, hvad man observerer, klar-i-morgen-greb, affekt/nedlukning og hvornår team/AKT/PPR bør ind over.",
    "Ved dybdegående svar må du gerne være længere, men stadig lærerrettet og let forståelig. Det skal føles som sparring, ikke som et kapitel.",
    "Hvis der i CDA-grundlaget findes relevante template_suggestions, må du nævne 2-4 af dem nederst som 'Mulige skabeloner'. Skriv kun navnene og en kort anvendelse. Åbn aldrig selve skabelonindholdet uden tydeligt bruger-kald.",
    "Hvis der i CDA-grundlaget findes relevante pbl_suggestions, og beskeden tydeligt afslører en reel interesse eller styrke hos barnet (fx et konkret emne, eleven fordyber sig i), SKAL du afslutte svaret med et kort, tydeligt afsnit om det, adskilt fra de øvrige råd — ikke kun væve interessen ind i den almindelige undervisningsrådgivning. Brug fx overskriften 'Mulig PBL-retning' og navngiv ét konkret forløb fra pbl_suggestions, fx: 'Mulig PBL-retning: [interesse] er tydeligvis noget, der fanger ham. \"[forløbstitel]\" kunne være en konkret vej ind i et PBL-forløb bygget om det — sig til, hvis du vil vide mere om, hvad det indebærer.' Nævn det kun, hvis det giver ægte mening ud fra det brugeren faktisk har skrevet, og opfind aldrig en interesse. Start ikke selve PBL-forløbet her, og lav ikke en fuld PBL-analyse; det er lærerens valg at gå videre.",
    "Brug ikke nummererede lister i HeidiFlow. Brug korte bullets med bindestreg, så output ikke bliver vist som 1, 1, 1.",
    "Skriv ikke 'Hvis du vil, kan jeg...' som afslutning, når brugeren allerede har bedt om dybde eller handling.",
  ];

  if (isDoesNotWorkFollowup(message)) {
    heidiShapeInstructions.push(
      "AKTUELT FOKUS: Brugeren siger, at noget ikke virker. Juster strategien tydeligt; gentag ikke samme råd. Giv 2-4 konkrete nye greb."
    );
  }

  if (isTeacherAffectRequest(message)) {
    heidiShapeInstructions.push(
      "AKTUELT FOKUS: Lærerens egen affekt/skyld. Medtag én reparationssætning til barnet efter situationen."
    );
  }

  if (isDeepInsightRequest(message)) {
    heidiShapeInstructions.push(
      "AKTUELT FOKUS: Brugeren beder om dybdegående indsigt. Giv den fulde lærerrettede forklaring nu, uden først at spørge om mere."
    );
  }

  if (isHeidiTemplateBuildRequest(message)) {
    heidiShapeInstructions.push(
      "AKTUELT FOKUS: Brugeren beder om at lave en konkret skabelon/aftale. Lav den færdig og brugsklar med det samme, tilpasset aktiv sag. Giv ikke kun råd om skabelonen.",
      "Ved skabelonkald: skriv en færdig kort version, som læreren kan bruge direkte. Brug tydelige afsnit som Formål, Aftale, Voksenens rolle, Sætning til eleven, Teamversion og Tegn på at aftalen virker — men kun de afsnit der passer.",
      "Ved skabelonkald: medtag gerne en meget kort elevvenlig sætning og en team-/kollegaversion, hvis det giver mening.",
      "Ved skabelonkald: afslut ikke med 'Hvis du vil...' og skriv ikke nye 'Mulige skabeloner' nederst, når du allerede har lavet skabelonen."
    );
  }

  return [
    heidiPrompt,
    "",
    audienceInstructions,
    "",
    activeCaseInstructions,
    "",
    "24A.1 HEIDIFLOW V1 — NORMAL CDA-SAMTALE",
    "Dette flow har forrang i almindelig lærer-/pædagog-/forælder-sparring, når brugeren ikke tydeligt har bedt om specialistpanel, PBL, rollespil eller en konkret skabelon.",
    "Heidi skal svare som levende samtalepartner, ikke som bogkapitel, diagnoseopslag eller skabelonbank.",
    "Barnet er centrum. Den voksne støttes, fordi lærerens/pædagogens ro, forståelse og handlinger hjælper barnet og fællesskabet.",
    "Børn skal ikke presses til at passe ind i stive rammer; rammer, krav, sprog og støtte skal justeres, så barnet kan deltage uden at fællesskabet vælter.",
    "Brug aktiv sag som arbejdshukommelse. Korte opfølgninger handler om samme barn/situation, medmindre brugeren tydeligt starter en ny sag.",
    "Hvis brugeren siger, at noget ikke virker, skal du justere strategien. Gentag ikke samme råd i ny formulering.",
    "Hvis pauser/aftaler/påmindelser gør barnet mere vredt, skal du undersøge om påmindelsen, synligheden eller voksenordene er blevet trigger — uden at skrive det som en fast skabelon.",
    "Skabeloner må ikke åbnes automatisk. Du må gerne foreslå relevante skabelonnavne kort, hvis de faktisk passer til casen. Vis kun skabelonens indhold, hvis brugeren tydeligt beder om det.",
    "Specialister er sekundære og må kun aktiveres ved tydeligt bruger-kald. Nævn ikke specialistpanelet i almindelig HeidiFlow.",
    "Diagnose/spor: Du må skrive 'det kan minde om' eller 'det kan være tegn på' relevante spor, men aldrig konkludere at barnet har en diagnose.",
    "Hvis brugeren skriver et diagnoseord i en aktiv sag, skal du koble forklaringen til netop den konkrete sag: 'Hvis [diagnose] er kendt eller mistænkt i denne case...' — ikke starte en løs artikel.",
    "Ved PPR/team/hjem: læreren observerer, CDA strukturerer, teamet koordinerer, AKT/PPR vurderer, hjemmet inddrages nænsomt, barnet støttes.",
    `AKTUEL SVARSTIL: ${responseStyle}`,
    `AKTUEL ROLLE I HEIDIFLOW: ${role}`,
    `HEIDIFLOW MODE: ${mode || "normal"}`,
    heidiShapeInstructions.join("\n"),
    styleInstruction,
  ].filter(Boolean).join("\n");
}

function buildHeidiFlowInput({ message, contextualInput, activeCaseContext, dataContext }) {
  const activeCaseSummary = hasActiveCaseContext(activeCaseContext)
    ? {
        summary: compactText(activeCaseContext.summary, 900),
        known_context: compactText(activeCaseContext.known_context, 700),
        last_user_message: compactText(activeCaseContext.last_user_message, 600),
        last_heidi_reply: compactText(activeCaseContext.last_heidi_reply, 650),
        last_guidance_summary: compactText(activeCaseContext.last_guidance_summary, 650),
      }
    : null;

  return [
    "BRUGERENS BESKED / AKTIVE SAMTALE:",
    contextualInput || message,
    "",
    activeCaseSummary ? "AKTIV SAG — KOMPAKT SAMTALEHUKOMMELSE:" : "",
    activeCaseSummary ? JSON.stringify(activeCaseSummary, null, 2) : "",
    "",
    "RELEVANT CDA-GRUNDLAG TIL HEIDIFLOW:",
    JSON.stringify(dataContext, null, 2),
    "",
    "VIGTIGT: Brug kun dette datagrundlag som baggrund. Vis ikke interne feltnavne, scores, ids eller datastruktur.",
  ].filter((line) => line !== "").join("\n");
}

export async function runHeidiFlow({
  openai,
  model = "gpt-5.4-mini",
  heidiPrompt,
  audienceInstructions,
  activeCaseInstructions,
  contextualInput,
  message,
  language,
  role,
  responseStyle,
  activeCaseContext,
  mode = "normal",
}) {
  const effectiveResponseStyle = resolveHeidiResponseStyle(message, responseStyle);

  const dataContext = buildHeidiFlowDataContext({
    message,
    activeCaseContext,
    responseStyle: effectiveResponseStyle,
  });

  const instructions = buildHeidiFlowInstructions({
    heidiPrompt,
    audienceInstructions,
    activeCaseInstructions,
    responseStyle: effectiveResponseStyle,
    role,
    mode,
    message,
    activeCaseContext,
  });

  const input = buildHeidiFlowInput({
    message,
    contextualInput,
    activeCaseContext,
    dataContext,
  });

  const response = await openai.responses.create({
    model,
    reasoning: {
      effort: "low",
    },
    instructions,
    input,
    max_output_tokens: effectiveResponseStyle === "Dyb" ? 1800 : effectiveResponseStyle === "Kort" ? 800 : 1000,
  });

  const usedDataSources = [
    "heidiFlow:v1.5",
    dataContext.semantic_signals.length > 0 ? "semantic:signals" : null,
    dataContext.emotion_signals?.matched_categories?.length > 0 ? "emotion:signals" : null,
    dataContext.diagnosis_context.length > 0 ? "diagnosis:context" : null,
    dataContext.template_suggestions.length > 0 ? "templates:suggestions" : null,
  ].filter(Boolean);

  const outputText = cleanHeidiOutputFormatting(response.output_text || "");

  return {
    response,
    outputText,
    usedDataSources,
    debug: {
      mode,
      language,
      role,
      response_style: effectiveResponseStyle,
      semantic_signal_count: dataContext.semantic_signals.length,
      emotion_category_count: dataContext.emotion_signals?.matched_categories?.length || 0,
      diagnosis_context_count: dataContext.diagnosis_context.length,
      template_suggestion_count: dataContext.template_suggestions.length,
      requested_response_style: responseStyle,
      deep_request_detected: isDeepInsightRequest(message),
      active_case_context: hasActiveCaseContext(activeCaseContext),
    },
  };
}
