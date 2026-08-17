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

function normalizeRoleplayPhrase(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRollespil(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "rollespil_scenarier.json"
  );

  const data = readJsonFile(
    filePath,
    "data/rollespil_scenarier.json blev ikke fundet"
  );

  const scenarios = Array.isArray(data)
    ? data
    : data.scenarier || data.data || [];

  if (args.caseId) {
    const scenario = scenarios.find(
      (item) =>
        String(item.id || "") === String(args.caseId)
    );

    return scenario
      ? {
          success: true,
          source: "local",
          data: scenario,
        }
      : {
          success: false,
          error: `Rollespilscase ikke fundet: ${args.caseId}`,
          available_cases: scenarios
            .map((item) => item.id)
            .filter(Boolean),
        };
  }

  return {
    success: true,
    source: "local",
    total: scenarios.length,
    data: scenarios,
  };
}

function isRoleplayTriggerMessage(message) {
  const text = normalizeRoleplayPhrase(message);
  const triggerPatterns = [
    "rollespil",
    "rollespil start",
    "kor en haendelse",
    "kor haendelse",
    "traen en situation",
    "traen situation",
    "ov en samtale",
    "ov samtale",
    "ppr mode",
    "skole hjem samtale",
  ];

  return triggerPatterns.some((pattern) =>
    text.includes(normalizeRoleplayPhrase(pattern))
  );
}

function isRoleplayContextActive(message, pendingActionValue) {
  return (
    isRoleplayTriggerMessage(message) || pendingActionValue === "roleplay_active"
  );
}

function buildRoleplayRuleInjection() {
  const rulesData = readJsonFile(
    path.join(process.cwd(), "data", "prompt_rules.json"),
    "data/prompt_rules.json blev ikke fundet"
  );

  const roleplayRules = rulesData?.system_rules?.roleplay_rules || {};
  const roleplayLearningRules =
    rulesData?.system_rules?.roleplay_learning_rules || {};

  return [
    "",
    "════════════════════════════════════════",
    "VIGTIGT — ROLLESPIL/TRÆNING ER AKTIVT I DENNE SAMTALE.",
    "Dette svar er IKKE normal rådgivning, selvom resten af denne prompt beskriver den normale CDA-stil.",
    "DU MÅ ALDRIG bruge overskrifterne 'Det peger mest på', 'Det vigtigste her er' eller 'Det kan du gøre nu' i dette svar — uanset hvor naturligt det ellers ville føles. De hører til normal drift, ikke rollespil.",
    "Brug i stedet KUN rollespillets egen struktur, beskrevet i roleplay_rules og roleplay_learning_rules herunder.",
    "════════════════════════════════════════",
    "",
    "roleplay_rules (allerede indlæst, kald ikke getPromptRules for denne):",
    JSON.stringify(roleplayRules, null, 2),
    "",
    "roleplay_learning_rules (allerede indlæst, kald ikke getPromptRules for denne):",
    JSON.stringify(roleplayLearningRules, null, 2),
    "",
    "Marker-regel: skal du afslutte dit svar med [[PENDING_ACTION:ROLEPLAY_ACTIVE]] som allersidste tegn i ALLE svar i dette spor — inklusive dette allerførste svar, under afklaring/forberedelse, og under selve øvelsen. Der findes ingen 'opstartsfase' uden markøren; fra første rollespil-relaterede svar og indtil det er helt slut, skal markøren altid med. Markøren vises ikke til brugeren. Udelad KUN markøren i det svar, hvor rollespillet/træningen reelt afsluttes, eller hvis brugeren tydeligt skifter emne til noget der intet har med rollespillet at gøre.",
    "Opfind aldrig egne kommandoer, motornavne eller statusbeskeder (fx 'rollespillet er ikke aktivt'). Brug kun de kommandoer og den struktur, der faktisk er beskrevet i roleplay_rules og roleplay_learning_rules herover.",
  ].join("\n");
}

export {
  buildRoleplayRuleInjection,
  getRollespil,
  isRoleplayContextActive,
  isRoleplayTriggerMessage,
};
