// Dagsplan-motor.
//
// To sammenhoerende dele: den praktiske dagsplan (til eleven/hjemmet)
// og forældre-beskeden om dagsplanen. Begge dele bygges dynamisk af AI'en
// ud fra den aktive sag/samtalekontekst, hvis den findes - ikke ud fra
// faste skabeloner. En dagsplan skal passe til barnet, ikke omvendt.

import { normalizeTemplateSearch } from "./templateResourceEngine.js";
import { formatLocalCaseValue } from "./localCaseEngine.js";
import {
  buildActiveCaseInstructions,
  buildContextualInput,
} from "./activeCaseContext.js";

function includesWholeWordOrPhrase(normalizedText, pattern) {
  const normalizedPattern = normalizeTemplateSearch(pattern);

  if (!normalizedPattern) return false;

  return ` ${normalizedText} `.includes(` ${normalizedPattern} `);
}

function isPracticalDayPlanRequest(message) {
  const text = normalizeTemplateSearch(message);

  if (!text) {
    return false;
  }

  // 24B.20H: raa substring-match ("byg") blev fejlagtigt fundet inde i
  // "dagplanbyggeren" (skabelonens eget navn) og fik et rent spørgsmål om
  // skabelonen til fejlagtigt at blive tolket som en anmodning om at bygge
  // en ny, praktisk dagsplan. Matcher nu kun hele ord/fraser.
  const hasDayPlanWord = [
    "dagsplan",
    "dagplan",
    "dagsskema",
    "visuel dagsplan",
    "skole hjem dagsplan",
    "morgenrutine",
    "aftenrutine",
    "rutinekort",
  ].some((pattern) => includesWholeWordOrPhrase(text, pattern));

  if (!hasDayPlanWord) {
    return false;
  }

  const practicalIntent = [
    "lav",
    "byg",
    "opret",
    "hjælp mig med",
    "hjaelp mig med",
    "jeg skal bruge",
    "brugbar",
    "praktisk",
    "kopier",
    "udskriv",
    "print",
    "med emojis",
    "med emoji",
    "med ikoner",
    "med skift",
    "med timer",
    "frokost",
    "morgenmad",
    "godnathistorie",
    "sove",
  ].some((pattern) => includesWholeWordOrPhrase(text, pattern));

  const pureDisplayIntent = [
    "vis skabelon til",
    "vis guide til",
    "vis overblik",
    "vis information",
  ].some((pattern) => includesWholeWordOrPhrase(text, pattern));

  // 24C.9: "dagplan"/"dagsplan" er tvetydigt - det kan enten betyde en
  // visuel dags-/rutineplan for et barn (det denne motor er bygget til),
  // eller en plan for hvordan man kommer i gang med et PBL-/projektforløb
  // (fx "lav en dagplan over hvad vi skal gøre for at pbl bliver startet
  // rigtigt"). De to er meget forskellige svar. Når beskeden tydeligt
  // handler om et projekt-/PBL-forløb, skal denne faste, kontekstløse
  // dagsplan-motor ikke tage over - spørgsmålet skal i stedet besvares af
  // den almindelige samtale, som kender resten af forløbet.
  const projectPlanningContext = ["pbl", "forlob", "projekt"].some(
    (pattern) => text.includes(pattern)
  );

  return practicalIntent && !pureDisplayIntent && !projectPlanningContext;
}

// Fanger opfølgninger på en dagsplan, der allerede er i gang i samtalen,
// selvom beskeden ikke selv nævner "dagsplan"/"dagplan" (fx "sæt overgange
// ind" eller "giv 2 minutters varsel før matematik"). Kræver at forrige
// svar reelt var en dagsplan (conversation_mode), så almindelige spørgsmål
// om noget andet ikke bliver kapret.
function isDayPlanFollowupRequest(message, activeCaseContext) {
  const modeSaysDayPlan = activeCaseContext?.conversation_mode === "day_plan";
  const lastReplyWasDayPlan = /barnets dagsplan/i.test(
    String(activeCaseContext?.last_heidi_reply || "")
  );

  if (!modeSaysDayPlan && !lastReplyWasDayPlan) {
    return false;
  }

  const text = normalizeTemplateSearch(message);

  if (!text) {
    return false;
  }

  const hasTimePattern = /\bkl\.?\s*\d{1,2}[:.]\d{2}\b/i.test(String(message || ""));

  const adjustmentIntent = [
    "sæt ind",
    "tilføj",
    "juster",
    "justér",
    "ret planen",
    "ret dagsplanen",
    "ændr planen",
    "opdater planen",
    "læg ind",
    "varsel",
    "overgang",
    "overgange",
    "flere trin",
    "et trin mere",
    "skift tid",
  ].some((pattern) => includesWholeWordOrPhrase(text, pattern));

  return hasTimePattern || adjustmentIntent;
}

function getPracticalDayPlanMode(message) {
  const text = normalizeTemplateSearch(message);

  const hasHomeSchool = [
    "skole hjem",
    "skole-hjem",
    "hjem skole",
    "hjemme",
    "forældre",
    "foraeldre",
    "før skole",
    "foer skole",
    "efter skole",
    "morgenmad",
    "ud til bil",
    "bil",
    "tv",
    "spil",
    "godnathistorie",
    "sove",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasEveningOnly = [
    "aftenrutine",
    "godnat",
    "godnathistorie",
    "sove",
    "sengetid",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasMorningOnly = [
    "morgenrutine",
    "morgenmad",
    "stå op",
    "staa op",
    "før skole",
    "foer skole",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  if (hasHomeSchool) return "home_school";
  if (hasEveningOnly) return "evening";
  if (hasMorningOnly) return "morning";
  return "school";
}

function getLocalCaseDisplayName(caseData) {
  const title = formatLocalCaseValue(caseData?.titel || caseData?.title || "");

  if (!title) {
    return "eleven";
  }

  const firstWord = title.split(/\s+/).find(Boolean);
  return firstWord || "eleven";
}

// Trækker kun de felter ud af en lokal sag, der reelt hjælper med at
// bygge en dagsplan der passer til DETTE barn - alder, konkret adfærd/
// udfordring og hvad der allerede er set virke. Opfinder ikke noget.
function buildLocalCaseSummaryForDayPlan(caseData) {
  if (!caseData) return "";

  const lines = [];
  const age = caseData.alder || caseData.age;
  if (age) lines.push(`Alder: ${formatLocalCaseValue(age)}`);

  const behavior = Array.isArray(caseData.adfærd)
    ? caseData.adfærd.join(", ")
    : caseData.adfærd || caseData.adfaerd;
  if (behavior) lines.push(`Adfærd/tegn: ${formatLocalCaseValue(behavior)}`);

  const environment = Array.isArray(caseData.miljø)
    ? caseData.miljø.join(", ")
    : caseData.miljø || caseData.miljoe;
  if (environment) lines.push(`Miljø: ${formatLocalCaseValue(environment)}`);

  const problem = caseData.problem;
  if (problem) lines.push(`Konkret udfordring: ${formatLocalCaseValue(problem, 500)}`);

  const measures = caseData.tiltag;
  if (measures) lines.push(`Tiltag der allerede er set virke: ${formatLocalCaseValue(measures, 500)}`);

  return lines.join("\n");
}

async function buildPracticalDayPlanReply({
  openai,
  message,
  mode,
  activeLocalCase = null,
  activeCaseContext = null,
  role = "Lærer",
  language = "Dansk",
}) {
  const modeLabel = {
    home_school: "fælles skole-hjem-dagsplan (morgen, skoledag og eftermiddag/aften hjemme)",
    morning: "morgenrutine før skole",
    evening: "aftenrutine",
    school: "skoledagsplan",
  }[mode] || "dagsplan";

  const caseSummary = buildLocalCaseSummaryForDayPlan(activeLocalCase);
  const childName = activeLocalCase ? getLocalCaseDisplayName(activeLocalCase) : "";

  const instructions = [
    "Du er CDA's dagsplan-motor.",
    "Byg dagsplanen i TO adskilte, kopierbare ``` text ``` kodeblokke - én til barnet og én til den voksne. Bland dem aldrig sammen.",
    "DEL 1 - BARNETS DAGSPLAN: kun det barnet selv skal se eller få vist. Kodeblokken skal starte med linjen \"BARNETS DAGSPLAN\" (præcis sådan, som overskrift). Brug derefter overvejende ikoner/emojis og meget få, korte ord (typisk 1-3 ord pr. trin). Mange børn husker grafik bedre end tekst, og nogle børn kan slet ikke læse endnu - planen skal give mening ud fra ikonerne alene. Ingen varsel-tider, voksen-strategi eller forklaringer i denne del.",
    "DEL 2 - TIL DEN VOKSNE (LÆRER/VIKAR): en tydeligt adskilt sektion efter barnets plan, overskrevet så det er klart at dette IKKE er en del af det, barnet ser. Her hører varsel-tider før overgange, faste sætninger den voksne siger, og hvad man skal være opmærksom på.",
    `Fokus for denne dagsplan: ${modeLabel}.`,
    "Brug ALTID konkrete oplysninger om barnet, uanset hvor de kommer fra - brugerens egen besked (BRUGERENS SPØRGSMÅL), en åben sag (SAGSOPLYSNINGER) eller samtalens hukommelse. Oplysninger i selve beskeden vejer lige så meget som en åben sag.",
    "Tilpas rækkefølge, sprog, pauser og støtte præcist til det, der reelt er oplyst om barnet. Opfind aldrig en diagnose eller detaljer, der ikke er nævnt nogen steder.",
    "Byg kun en generel, alderssvarende standardplan, hvis der reelt ikke er givet nogen konkrete oplysninger om et bestemt barn nogen steder i det, du har fået.",
    "Afslut voksen-delen altid med et kort, konkret afsnit om hvad den voksne og barnet gør, HVIS planen ændrer sig undervejs.",
    "Én kort indledningssætning før den første kodeblok. Ingen afsluttende sætning efter den anden kodeblok ud over evt. én kort note om at tilpasse tider/aktiviteter til barnet.",
    role === "Forælder"
      ? "Modtageren er en forælder - hold sproget hverdagsnært."
      : "Modtageren er en lærer/pædagog - hold sproget praksisnært og direkte anvendeligt.",
    language === "English"
      ? "Answer in English."
      : "Svar på dansk.",
    buildActiveCaseInstructions(activeCaseContext, message),
  ].filter(Boolean).join("\n");

  const inputParts = [
    "BRUGERENS SPØRGSMÅL:",
    buildContextualInput(message, activeCaseContext),
  ];

  if (caseSummary) {
    inputParts.push(
      "",
      "SAGSOPLYSNINGER (aktiv lokal sag):",
      childName ? `Navn/forbogstav der kan bruges i planen: ${childName}` : "",
      caseSummary
    );
  }

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions,
    input: inputParts.filter(Boolean).join("\n"),
    max_output_tokens: 1100,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra dagsplan-motoren");
  }

  const outputText = String(response.output_text || "").trim();

  if (!outputText) {
    throw new Error("Dagsplan-motoren returnerede intet svar");
  }

  return { reply: outputText, response };
}

function isParentDayPlanMessageRequest(message) {
  const text = normalizeTemplateSearch(message);

  if (!text) {
    return false;
  }

  const hasParentMessage = [
    "besked til foraeldre",
    "besked til foraeldrene",
    "skriv til foraeldre",
    "skriv til foraeldrene",
    "mail til foraeldre",
    "mail til foraeldrene",
    "forældrebesked",
    "foraeldrebesked",
    "kort besked",
    "kort skrivelse",
    "tekst til hjemmet",
    "skole hjem besked",
    "skole-hjem besked",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasHomeRecipient = [
    "foraeldre",
    "foraeldrene",
    "forældre",
    "forældrene",
    "hjemmet",
    "hjem",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  const hasDayPlan = [
    "dagsplan",
    "dagplan",
    "dagsskema",
    "visuel dagsplan",
    "morgenrutine",
    "aftenrutine",
    "skole hjem dagsplan",
    "skole-hjem dagsplan",
  ].some((pattern) => text.includes(normalizeTemplateSearch(pattern)));

  return hasDayPlan && (hasParentMessage || hasHomeRecipient);
}

async function buildParentDayPlanMessageReply({
  openai,
  message,
  activeLocalCase = null,
  activeCaseContext = null,
  language = "Dansk",
}) {
  const caseSummary = buildLocalCaseSummaryForDayPlan(activeLocalCase);
  const studentName = getLocalCaseDisplayName(activeLocalCase);

  const instructions = [
    "Du er CDA's dagsplan-motor.",
    "Skriv en kort, kopierbar besked fra skolen til forældrene om barnets visuelle dagsplan.",
    "Beskeden skal forklare kort HVORFOR der bruges en visuel dagsplan, vise nogle få eksempler på de korte trin/ikoner skolen bruger, og opfordre forældrene til at bruge samme type korte trin derhjemme (morgen og evt. aften).",
    "Brug ALTID konkrete oplysninger om barnet, uanset hvor de kommer fra - brugerens egen besked (BRUGERENS SPØRGSMÅL), en åben sag (SAGSOPLYSNINGER) eller samtalens hukommelse. Oplysninger i selve beskeden vejer lige så meget som en åben sag.",
    "Tilpas eksemplerne og formålet præcist til det, der reelt er oplyst. Opfind aldrig en diagnose eller detaljer, der ikke er nævnt nogen steder.",
    "Skriv kun en god, generel version af beskeden, hvis der reelt ikke er givet nogen konkrete oplysninger om et bestemt barn nogen steder i det, du har fået.",
    "Formålet skal altid formuleres positivt: at gøre skift mere tydelige og forudsigelige - aldrig at kontrollere eller straffe barnet.",
    `Brug ${studentName} som barnets navn i beskeden.`,
    "Skriv beskeden i en ``` text ``` kodeblok med hilsen 'Hej', afslutning 'Venlig hilsen' og '[navn]' til sidst, så den er klar til at kopiere. Én kort indledningssætning før kodeblokken.",
    language === "English"
      ? "Answer in English, with a matching greeting/closing."
      : "Svar på dansk.",
    buildActiveCaseInstructions(activeCaseContext, message),
  ].filter(Boolean).join("\n");

  const inputParts = [
    "BRUGERENS SPØRGSMÅL:",
    buildContextualInput(message, activeCaseContext),
  ];

  if (caseSummary) {
    inputParts.push(
      "",
      "SAGSOPLYSNINGER (aktiv lokal sag):",
      caseSummary
    );
  }

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions,
    input: inputParts.filter(Boolean).join("\n"),
    max_output_tokens: 900,
  });

  if (response.status === "incomplete") {
    throw new Error("Ufuldstændigt svar fra forældrebesked-motoren");
  }

  const outputText = String(response.output_text || "").trim();

  if (!outputText) {
    throw new Error("Forældrebesked-motoren returnerede intet svar");
  }

  return { reply: outputText, response };
}

export {
  isPracticalDayPlanRequest,
  isDayPlanFollowupRequest,
  getPracticalDayPlanMode,
  buildPracticalDayPlanReply,
  isParentDayPlanMessageRequest,
  buildParentDayPlanMessageReply,
};
