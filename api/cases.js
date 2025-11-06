import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { file } = req.query;
    const dataDir = path.join(process.cwd(), "data", "cases");

    // Hent alle filer i /data/cases/
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

    // 1️⃣ Hvis kun oversigt ønskes
    if (!file) {
      return res.status(200).json({
        success: true,
        source: "all_files",
        data: {
          total_cases: 0,
          source_files: files,
          cases: []
        }
      });
    }

    // 2️⃣ Hvis en specifik fil ønskes
    const loadFile = async (filename) => {
      const filePath = path.join(dataDir, filename);
      if (!fs.existsSync(filePath)) return null;
      const fileData = fs.readFileSync(filePath, "utf8");
      return JSON.parse(fileData);
    };

    // 3️⃣ Hvis ?file=all → hent alle
    if (file === "all") {
      let combined = [];
      for (const f of files) {
        const content = await loadFile(f);
        if (content && content.cases) combined = combined.concat(content.cases);
      }
      return res.status(200).json({
        success: true,
        source: JSON.stringify({ cases: combined, source_files: files })
      });
    }

    // 4️⃣ Hvis ?file=<navn>.json → hent den ene
    if (files.includes(file)) {
      const content = await loadFile(file);
      return res.status(200).json({
        success: true,
        source: JSON.stringify(content)
      });
    }

    // 5️⃣ Hvis fil ikke findes
    return res.status(404).json({
      success: false,
      error: "Filen findes ikke.",
      available_files: files
    });

  } catch (error) {
    console.error("❌ CASES API FEJL:", error);
    res.status(500).json({
      success: false,
      error: "Serverfejl: " + error.message
    });
  }
}
