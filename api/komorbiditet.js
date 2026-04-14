import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      allowed_methods: ["GET"],
    });
  }

  try {
    const dataPath = path.join(process.cwd(), "data", "CDA_Komorbiditet.json");
    const rawData = readJsonFile(dataPath);
    const komorbiditetData = rawData.komorbiditet_data || [];

    const { primary, id } = req.query;

    if (id) {
      for (const diagnosis of komorbiditetData) {
        const match = (diagnosis.comorbidities || []).find(
          (item) => item.id.toLowerCase() === String(id).toLowerCase()
        );

        if (match) {
          return res.status(200).json({
            success: true,
            source: "local",
            type: "comorbidity",
            data: match,
          });
        }
      }

      return res.status(404).json({
        success: false,
        error: "Komorbiditet ikke fundet",
        query: { id },
      });
    }

    if (primary) {
      const match = komorbiditetData.find(
        (item) =>
          item.primary_diagnosis.toLowerCase() === String(primary).toLowerCase() ||
          item.id.toLowerCase() === String(primary).toLowerCase()
      );

      if (!match) {
        return res.status(404).json({
          success: false,
          error: "Primær diagnose ikke fundet",
          query: { primary },
        });
      }

      return res.status(200).json({
        success: true,
        source: "local",
        type: "primary_diagnosis",
        data: match,
      });
    }

    return res.status(200).json({
      success: true,
      source: "local",
      type: "all",
      count: komorbiditetData.length,
      data: komorbiditetData,
    });
  } catch (error) {
    console.error("Komorbiditet API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load komorbiditet data",
      message: error.message,
    });
  }
}