import fs from "fs";
import path from "path";

function safeString(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function loadAllCases() {
  const casesDir = path.join(process.cwd(), "public", "CDA", "cases");

  if (!fs.existsSync(casesDir)) {
    throw new Error(`Case-mappe ikke fundet: ${casesDir}`);
  }

  const files = fs
    .readdirSync(casesDir)
    .filter(
      (file) =>
        file.toLowerCase().endsWith(".json") &&
        !file.toLowerCase().includes("index")
    );

  let allCases = [];

  for (const file of files) {
    const filePath = path.join(casesDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    const fileCases = Array.isArray(parsed) ? parsed : parsed.cases || [];

    allCases = allCases.concat(fileCases);
  }

  return allCases;
}

export default async function handler(req, res) {
  try {
    const { id, search, tema, diagnose, kategori } = req.query;

    const cases = loadAllCases();

    if (id) {
      const match = cases.find(
        (c) => safeString(c.id).toLowerCase() === safeString(id).toLowerCase()
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
      const q = safeString(tema).toLowerCase();
      filtered = filtered.filter((c) =>
        safeString(c.tema).toLowerCase().includes(q)
      );
    }

    if (diagnose) {
      const q = safeString(diagnose).toLowerCase();
      filtered = filtered.filter(
        (c) =>
          Array.isArray(c.diagnoser) &&
          c.diagnoser.some((d) => safeString(d).toLowerCase().includes(q))
      );
    }

    if (kategori) {
      const q = safeString(kategori).toLowerCase();
      filtered = filtered.filter((c) =>
        safeString(c.kategori).toLowerCase().includes(q)
      );
    }

    if (search) {
      const q = safeString(search).toLowerCase();

      filtered = filtered.filter((c) =>
        safeString(c.id).toLowerCase().includes(q) ||
        safeString(c.titel).toLowerCase().includes(q) ||
        safeString(c.tema).toLowerCase().includes(q) ||
        safeString(c.problem).toLowerCase().includes(q) ||
        safeString(c.barnets_oplevelse).toLowerCase().includes(q) ||
        safeString(c.typisk_fejl).toLowerCase().includes(q) ||
        safeString(c.løsning).toLowerCase().includes(q) ||
        safeString(c.tiltag).toLowerCase().includes(q) ||
        safeString(c.værktøjer).toLowerCase().includes(q) ||
        safeString(c.kategori).toLowerCase().includes(q) ||
        safeString(c.kort_beskrivelse).toLowerCase().includes(q) ||
        (Array.isArray(c.diagnoser) &&
          c.diagnoser.some((d) => safeString(d).toLowerCase().includes(q))) ||
        (Array.isArray(c.miljø) &&
          c.miljø.some((m) => safeString(m).toLowerCase().includes(q)))
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