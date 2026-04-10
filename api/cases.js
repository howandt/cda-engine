import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { id, search, tema, diagnose } = req.query;

    const dataPath = path.join(
      process.cwd(),
      "data",
      "cases_ORIGINAL_ARCHIVE",
      "adhd_angst_cases.json"
    );

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({
        success: false,
        error: `Datafil ikke fundet: ${dataPath}`,
      });
    }

    const raw = fs.readFileSync(dataPath, "utf8");
    const parsed = JSON.parse(raw);
    const cases = Array.isArray(parsed) ? parsed : parsed.cases || [];

    if (id) {
      const match = cases.find(
        (c) => String(c.id || "").toLowerCase() === String(id).toLowerCase()
      );

      if (!match) {
        return res.status(404).json({
          success: false,
          error: `Ingen case fundet med ID: ${id}`,
        });
      }

      return res.status(200).json({
        success: true,
        total: 1,
        data: match,
      });
    }

    let filtered = cases;

    if (tema) {
      filtered = filtered.filter((c) =>
        String(c.tema || "").toLowerCase().includes(String(tema).toLowerCase())
      );
    }

    if (diagnose) {
      filtered = filtered.filter((c) =>
        Array.isArray(c.relevante_diagnoser) &&
        c.relevante_diagnoser.some((d) =>
          String(d).toLowerCase().includes(String(diagnose).toLowerCase())
        )
      );
    }

    if (search) {
      const q = String(search).toLowerCase();

      filtered = filtered.filter((c) =>
        String(c.id || "").toLowerCase().includes(q) ||
        String(c.titel || "").toLowerCase().includes(q) ||
        String(c.tema || "").toLowerCase().includes(q) ||
        String(c.beskrivelse || "").toLowerCase().includes(q) ||
        String(c.cda_guiding || "").toLowerCase().includes(q) ||
        String(c.cdt_træning || "").toLowerCase().includes(q) ||
        (Array.isArray(c.relevante_diagnoser) &&
          c.relevante_diagnoser.some((d) =>
            String(d).toLowerCase().includes(q)
          ))
      );
    }

    return res.status(200).json({
      success: true,
      total: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error("FEJL i /api/cases:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}