import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { file } = req.query;
    const dataDir = path.join(process.cwd(), "data", "cases");

    // Hent alle .json-filer i /data/cases/
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

    // Hjælpefunktion til at læse en fil
    const loadFile = (filename) => {
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) return null;
      const fileData = fs.readFileSync(filePath, "utf8");
      try {
        return JSON.parse(fileData);
      } catch (e) {
        console.error("❌ Kunne ikke parse:", filename, e);
        return null;
      }
    };

    // 🔹 Hvis ?file=all → saml alle cases
    if (file === "all") {
      let combined = [];
      for (const f of files) {
        const content = loadFile(f);
        if (content?.cases) combined = combined.concat(content.cases);
      }

      const result = { cases: combined, source_files: files };
      return res.status(200).json({
        success: true,
        source: JSON.stringify(result)
      });
    }

    // 🔹 Hvis ?file=<navn>.json → hent specifik fil
    if (file && files.includes(file)) {
      const content = loadFile(file);
      return res.status(200).json({
        success: true,
        source: JSON.stringify(content)
      });
    }

    // 🔹 Hvis ingen ?file → hent ALLE cases (samlet oversigt)
    let combined = [];
    for (const f of files) {
      const content = loadFile(f);
      if (content?.cases) combined = combined.concat(content.cases);
    }

    const overview = { cases: combined, source_files: files };
    return res.status(200).json({
      success: true,
      source: JSON.stringify(overview)
    });

  } catch (error) {
    console.error("❌ FEJL i /api/cases:", error);
    return res.status(500).json({
      success: false,
      error: "Serverfejl: " + error.message
    });
  }
}
