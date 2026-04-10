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
    const { caseId } = req.query;

    const dataPath = path.join(process.cwd(), "data", "rollespil_scenarier.json");
    const data = readJsonFile(dataPath);
    const scenarios = Array.isArray(data) ? data : data.scenarier || data.data || [];

    if (caseId) {
      const caseData = scenarios.find(
        (item) => String(item.id || "") === String(caseId)
      );

      if (!caseData) {
        return res.status(404).json({
          success: false,
          error: "Case ikke fundet",
          available_cases: scenarios.map((item) => item.id).filter(Boolean),
        });
      }

      return res.status(200).json({
        success: true,
        source: "local",
        data: caseData,
      });
    }

    return res.status(200).json({
      success: true,
      source: "local",
      total: scenarios.length,
      data: scenarios,
    });
  } catch (error) {
    console.error("Rollespil API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load rollespil data",
      message: error.message,
    });
  }
}