import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { file } = req.query;
    const dataDir = path.join(process.cwd(), "data", "cases");

    // Find alle JSON-filer i /data/cases/
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

    // Hjælpefunktion: indlæs og parse JSON-fil
    const loadFile = (filename) => {
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) return null;

      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);

        // Hvis filen ER et array, pak den ind som { cases: [...] }
        if (Array.isArray(parsed)) {
          return { cases: parsed };
        }

        // Hvis den har et felt "cases", brug det direkte
        if (parsed.cases) {
          return parsed;
        }

        // Ellers returner tomt fallback
        return { cases: [] };
      } catch (error) {
        console.error("❌ Parsefejl i", filename, error);
        return { cases: [] };
      }
    };

    // 🧠 Saml alle cases (brugt både ved oversigt og all)
    const collectAllCases = () => {
      let all = [];
      for (const f of files) {
        const content = loadFile(f);
        if (content?.cases?.length) all = all.concat(content.cases);
      }
      return all;
    };

    // 🔹 Hvis ?file=all → saml alle filer
    if (file === "all") {
      const combined = collectAllCases();
      const result = { cases: combined, source_files: files };
      return res.status(200).json({
        success: true,
        source: JSON.stringify(result)
      });
    }

    // 🔹 Hvis ?file=<specifik>
    if (file && files.includes(file)) {
      const content = loadFile(file);
      return res.status(200).json({
        success: true,
        source: JSON.stringify(content)
      });
    }

    // 🔹 Standard: hent alt (oversigt + cases)
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
