// Delt tekst-normaliserings-lag.
//
// normalizeDiagnosisPhrase / containsDiagnosisPhrase bruges BÅDE af
// diagnose-motoren, komorbiditets-motoren og flere trigger-detektorer
// direkte i cda-chat.js (dagsplan, forældrebesked, børnehave-praksis,
// navigations-håndtering).
//
// De ligger her i et selvstændigt, side-effekt-frit modul, så begge
// sider altid importerer samme funktion i stedet for at have hver
// deres kopi, der kan skride fra hinanden.

export function normalizeDiagnosisPhrase(value) {
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

export function containsDiagnosisPhrase(normalizedText, phrase) {
  const normalizedPhrase = normalizeDiagnosisPhrase(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}
