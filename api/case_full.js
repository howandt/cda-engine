import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: "Der skal angives et case-id." });
      return;
    }

    // --- Filstier ---
    const casePath = path.join(process.cwd(), "data", "CDA_Casebank.json");
    const rollespilPath = path.join(process.cwd(), "data", "rollespil_scenarier.json");
    const templatePath = path.join(process.cwd(), "data", "CDA_Templates.json");
    const specialistPath = path.join(process.cwd(), "data", "CDA_SpecialistPanel.json");

    // --- Indlæs filer ---
    const cases = JSON.parse(fs.readFileSync(casePath, "utf8"));
    const rollespil = JSON.parse(fs.readFileSync(rollespilPath, "utf8"));
    const templates = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const specialists = JSON.parse(fs.readFileSync(specialistPath, "utf8"));

    // --- Find data ---
    const valgtCase = cases.find((c) => c.id === id);
    const valgtRollespil = rollespil.find((r) => r.id === id);
    const valgtTemplate = templates.find((t) => t.case_id === id);
    const relevanteSpecialister = specialists.filter((s) =>
      valgtCase && s.fokusområder
        ? s.fokusområder.some((f) =>
            valgtCase.temaer?.includes(f) || valgtRollespil?.titel?.includes(f)
          )
        : false
    );

    if (!valgtCase) {
      res.status(404).json({ error: "Case ikke fundet." });
      return;
    }

    // --- Samlet output ---
    const samlet = {
      case: valgtCase,
      rollespil: valgtRollespil || "Ingen rollespil fundet for denne case.",
      template: valgtTemplate || "Ingen skabelon knyttet endnu.",
      specialister: relevanteSpecialister.length > 0 ? relevanteSpecialister : "Ingen relevante specialister fundet."
    };

    res.status(200).json(samlet);
  } catch (err) {
    res.status(500).json({ error: "Fejl i case_full API", details: err.message });
  }
}
