import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const filePath = path.join(process.cwd(), "data", "rollespil_scenarier.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const scenarier = JSON.parse(fileData);

    const { id, role, situation, reverse } = req.query;

    // Filtrering
    let resultat = scenarier;
    if (id) resultat = resultat.filter((s) => s.id === id);
    if (role) resultat = resultat.filter((s) => s.roller.includes(role));
    if (situation) resultat = resultat.filter((s) => s.situationstype === situation);

    if (resultat.length === 0) {
      res.status(404).json({ message: "Ingen matchende scenarier fundet." });
      return;
    }

    const valgt = resultat[0];
    const output = {
      titel: valgt.titel,
      dialog: valgt.dialog,
      system: valgt.system,
    };

    // Reverse-visning
    if (reverse === "true") {
      output.reverse_view = `Når du siger: “${valgt.dialog[0].tekst}” – oplever barnet: “${valgt.dialog[1].tekst}”`;
    }

    res.status(200).json(output);
  } catch (err) {
    res.status(500).json({ error: "Fejl i rollemotoren", details: err.message });
  }
}
