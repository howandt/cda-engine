import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    // Tillad adgang fra andre systemer (GPT, CDA, CDT)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    // Find og læs rollespilsfilen
    const filePath = path.join(process.cwd(), "data", "rollespil_scenarier.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const scenarier = JSON.parse(fileData);

    // Modtag parametre fra kald (fx ?id=frikvarter_1)
    const { id, reverse, role, view } = req.query;

    // Find scenariet
    let valgt = scenarier.find((s) => s.id === id);

    if (!valgt) {
      res.status(404).json({ error: "Ingen matchende scenarie fundet." });
      return;
    }

    // Hvis reverse er true -> vis oplevelser
    let output = {
      id: valgt.id,
      titel: valgt.titel,
      sted: valgt.sted,
      tid: valgt.tid,
      roller: valgt.roller,
      dialog: valgt.dialog,
      refleksion: valgt.refleksion,
    };

    if (reverse === "true") {
      output.reverse = valgt.reverse;
    }

    // Hvis der skal vises specialist-råd
    if (view === "specialist") {
      output.specialist_råd = valgt.specialist_råd;
    }

    // Hvis der ønskes kun specifik rolle
    if (role) {
      const rolleDialog = valgt.dialog.filter((d) => d.taler === role);
      output.dialog = rolleDialog.length > 0 ? rolleDialog : valgt.dialog;
    }

    res.status(200).json(output);
  } catch (err) {
    res.status(500).json({
      error: "Fejl i Rollespilsmotoren",
      details: err.message,
    });
  }
}
