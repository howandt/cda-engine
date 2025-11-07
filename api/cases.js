import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { file } = req.query;

    // 🔹 NY sti – matcher din nye struktur
    const dataDir = path.join(process.cwd(), "data", "cases_ORIGINAL_ARCHIVE");

    // Tjek at mappen eksisterer
    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({
        success: false,
        error: `Mappe ikke fundet: ${dataDir}`
      });
    }

    // Find alle JSON-filer i mappen
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

    // Hjælpefunktion: indlæs og parse JSON-fil
    const loadFile = (filename) => {
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) return null;

      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);

        // Hvis filen er et array → pak den som { cases: [...] }
        if (Array.isArray(parsed)) return { cases: parsed };

        // Hvis der allerede findes "cases" → brug direkte
        if (parsed.cases) return parsed;

        // Ellers returnér tom struktur
        return { cases: [] };
      } catch (error) {
        console.error("❌ Parsefejl i", filename, error);
        return { cases: [] };
      }
    };

    // Saml alle cases på tværs af filer
    const collectAllCases = () => {
      let all = [];
      for (const f of files) {
        const content = loadFile(f);
        if (content?.cases?.length) all = all.concat(content.cases);
      }
      return all;
    };

    // 🔸 Hvis ?file=all → returnér alt
    if (file === "all") {
      const combined = collectAllCases();
      const result = { cases: combined, source_files: files };
      return res.status(200).json({
        success: true,
        source: JSON.stringify(result)
      });
    }

    // 🔸 Hvis ?file=<specifik>
    if (file && files.includes(file)) {
      const content = loadFile(file);
      return res.status(200).json({
        success: true,
        source: JSON.stringify(content)
      });
    }

    // 🔸 Standard: hent alt
    const combined = collectAllCases();
    const overview = { cases: combined, source_files: files };

    return res.status(200).json({
      success: true,
      source: JSON.stringify(overview)
    });

  } catch (error) {
    console.error("❌ FEJL i /api/cases:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
