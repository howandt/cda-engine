// Dagsplan-motor.
//
// To sammenhoerende dele: den praktiske dagsplan (til eleven/hjemmet)
// og forældre-beskeden om dagsplanen.

import { normalizeTemplateSearch } from "./templateResourceEngine.js";
import { formatLocalCaseValue } from "./localCaseEngine.js";

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

function buildPracticalDayPlanReply(message, language = "Dansk") {
  const mode = getPracticalDayPlanMode(message);

  const intro = language === "English"
    ? "Here is a copy-ready visual day plan with icons/emojis:"
    : "Her er en kopierbar visuel dagsplan med ikoner/emojis:";

  const note = language === "English"
    ? "Adjust times and activities to the child. Keep one fixed order and one calm backup plan."
    : "Tilpas tider og aktiviteter til barnet. Behold fast rækkefølge og én rolig reserveplan.";

  const schoolPlan = [
    "📅 VISUEL SKOLEDAGSPLAN",
    "",
    "🕗 08.00  👋 Kom ind / sig godmorgen",
    "🕘 08.10  🎒 Pak tasken ud",
    "🕤 08.20  🪑 Find plads / se dagens plan",
    "📚 08.30  Første opgave",
    "☕ 09.00  Kort pause",
    "📚 09.10  Arbejd videre",
    "🏃 09.45  Frikvarter",
    "🔢 10.15  Næste fag / aktivitet",
    "🔁 11.00  Forbered skift til frokost",
    "🍽️ 11.10  Frokost",
    "😌 11.35  Rolig pause",
    "🎨 12.00  Praktisk/kreativ aktivitet",
    "🧩 12.40  Kort opgave eller valgaktivitet",
    "🏁 13.00  Pak sammen / afslutning",
    "🏠 13.15  SFO / hjem",
    "",
    "🟡 HVIS PLANEN ÆNDRER SIG",
    "1. Den voksne fortæller det kort.",
    "2. Barnet får vist den nye rækkefølge.",
    "3. Barnet kan få en kort pause før næste skift.",
  ].join("\n");

  const homeSchoolPlan = [
    "📅 FÆLLES SKOLE-HJEM DAGSPLAN",
    "",
    "🏠 MORGEN HJEMME",
    "🛏️  Stå op",
    "🦷  Børste tænder",
    "👕  Tøj på",
    "🥣  Morgenmad",
    "🎒  Taske klar",
    "🚗  Ud til bil / afsted mod skole",
    "",
    "🏫 SKOLESTART",
    "👋  Modtagelse af kendt voksen",
    "🎒  Pak tasken ud",
    "🪑  Find plads / se dagens plan",
    "📚  Første korte opgave",
    "",
    "🏫 SKOLEDAG",
    "☕  Kort pause",
    "📚  Arbejd videre",
    "🏃  Frikvarter",
    "🍽️  Frokost",
    "😌  Rolig pause",
    "🏁  Afslutning / pak sammen",
    "",
    "🏠 EFTER SKOLE HJEMME",
    "🍎  Mad/snack",
    "😌  Pause uden krav",
    "🎮  Spil / skærmtid efter aftale",
    "📚  Lektier kun hvis aftalt",
    "🍽️  Aftensmad",
    "🛁  Bad / hygiejne",
    "📖  Godnathistorie / rolig aktivitet",
    "😴  Sove",
    "",
    "📝 KORT SKOLE-HJEM AFTALE",
    "- Hvad hjalp i morges? ____________________",
    "- Hvordan startede skoledagen? _____________",
    "- Hvad skal gentages i morgen? _____________",
  ].join("\n");

  const morningPlan = [
    "🌅 MORGENRUTINE FØR SKOLE",
    "",
    "🛏️  Stå op",
    "🚽  Toilet",
    "🦷  Børste tænder",
    "👕  Tøj på",
    "🥣  Morgenmad",
    "🎒  Taske klar",
    "👟  Sko og overtøj",
    "🚗  Ud til bil / afsted",
    "",
    "🟡 HVIS DET BLIVER SVÆRT",
    "☐ Kort pause",
    "☐ Voksen viser næste trin",
    "☐ Én besked ad gangen",
  ].join("\n");

  const eveningPlan = [
    "🌙 AFTENRUTINE",
    "",
    "🍽️  Aftensmad",
    "🎮  Spil / skærmtid efter aftale",
    "🛁  Bad / hygiejne",
    "👕  Nattøj",
    "🎒  Gør taske klar til i morgen",
    "📖  Godnathistorie / rolig aktivitet",
    "💡  Lys ned / rolig stemme",
    "😴  Sove",
    "",
    "🟡 HVIS DET BLIVER SVÆRT",
    "☐ Kort pause",
    "☐ Voksen gentager planen roligt",
    "☐ Samme rækkefølge i morgen",
  ].join("\n");

  const body = mode === "home_school"
    ? homeSchoolPlan
    : mode === "morning"
      ? morningPlan
      : mode === "evening"
        ? eveningPlan
        : schoolPlan;

  return [intro, "", "```text", body, "```", "", note].join("\n");
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

function getLocalCaseDisplayName(caseData) {
  const title = formatLocalCaseValue(caseData?.titel || caseData?.title || "");

  if (!title) {
    return "eleven";
  }

  const firstWord = title.split(/\s+/).find(Boolean);
  return firstWord || "eleven";
}

function buildParentDayPlanMessageReply(activeLocalCase = null, language = "Dansk") {
  const studentName = getLocalCaseDisplayName(activeLocalCase);

  if (language === "English") {
    return [
      "Here is a short copy-ready message for the parents:",
      "",
      "```text",
      "Hi",
      "",
      `We have made a simple visual day plan for ${studentName}, so the day becomes more predictable and easier to follow.`,
      "",
      "At school we use short steps and small icons, for example:",
      "👋 Arrive",
      "🎒 Unpack bag",
      "📚 Short task",
      "☕ Break",
      "📚 Work again",
      "🍽️ Lunch",
      "😌 Calm pause",
      "🏁 Finish the day",
      "",
      "It may help to use the same type of short steps at home:",
      "",
      "🏠 Morning:",
      "🛏️ Get up",
      "🦷 Brush teeth",
      "👕 Get dressed",
      "🥣 Breakfast",
      "🎒 Bag ready",
      "🚗 Leave for school",
      "",
      "🏠 After school/evening:",
      "🍎 Snack",
      "🎮 Screen time by agreement",
      "📚 Homework for a short time if agreed",
      "🛁 Bath / hygiene",
      "📖 Story or calm activity",
      "😴 Sleep",
      "",
      `The aim is not to control ${studentName}, but to make transitions clearer and reduce pressure during the day.`,
      "",
      "Kind regards",
      "[name]",
      "```",
    ].join("\n");
  }

  return [
    "Her er en kort kopierbar besked til forældrene:",
    "",
    "```text",
    "Hej",
    "",
    `Vi har lavet en enkel visuel dagsplan for ${studentName}, så dagen bliver mere tydelig og forudsigelig.`,
    "",
    "I skolen bruger vi korte trin og små ikoner, fx:",
    "👋 Kom ind",
    "🎒 Pakke ud",
    "📚 Kort opgave",
    "☕ Pause",
    "📚 Arbejde igen",
    "🍽️ Frokost",
    "😌 Rolig pause",
    "🏁 Afslutning",
    "",
    "Det kan måske hjælpe, hvis I bruger samme type korte trin hjemme:",
    "",
    "🏠 Morgen:",
    "🛏️ Stå op",
    "🦷 Børste tænder",
    "👕 Tøj på",
    "🥣 Morgenmad",
    "🎒 Taske klar",
    "🚗 Afsted til skole",
    "",
    "🏠 Efter skole/aften:",
    "🍎 Snack",
    "🎮 Skærmtid efter aftale",
    "📚 Lektier i kort tid, hvis det er aftalt",
    "🛁 Bad / hygiejne",
    "📖 Godnathistorie eller rolig aktivitet",
    "😴 Sove",
    "",
    `Formålet er ikke at styre ${studentName}, men at gøre skift mere overskuelige og mindske pres i løbet af dagen.`,
    "",
    "Venlig hilsen",
    "[navn]",
    "```",
  ].join("\n");
}



export {
  isPracticalDayPlanRequest,
  getPracticalDayPlanMode,
  buildPracticalDayPlanReply,
  isParentDayPlanMessageRequest,
  buildParentDayPlanMessageReply,
};
