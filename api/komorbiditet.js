import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
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

    const { primary, id, trigger } = req.query;
    const normalizedPrimary = normalize(primary);
    const normalizedId = normalize(id);
    const normalizedTrigger = normalize(trigger);

    if (normalizedId) {
      for (const diagnosis of komorbiditetData) {
        const match = (diagnosis.comorbidities || []).find(
          (item) => normalize(item.id) === normalizedId
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

    if (normalizedPrimary && normalizedTrigger) {
      const primaryMatch = komorbiditetData.find(
        (item) =>
          normalize(item.primary_diagnosis) === normalizedPrimary ||
          normalize(item.id) === normalizedPrimary
      );

      if (!primaryMatch) {
        return res.status(404).json({
          success: false,
          error: "Primær diagnose ikke fundet",
          query: { primary, trigger },
        });
      }

      const matches = (primaryMatch.comorbidities || []).filter((item) =>
        (item.trigger_tegn || []).some((tegn) =>
          normalize(tegn).includes(normalizedTrigger)
        )
      );

      return res.status(200).json({
        success: true,
        source: "local",
        type: "trigger_search",
        primary_diagnosis: primaryMatch.primary_diagnosis,
        trigger: trigger,
        count: matches.length,
        data: matches,
      });
    }

    if (normalizedPrimary) {
      const match = komorbiditetData.find(
        (item) =>
          normalize(item.primary_diagnosis) === normalizedPrimary ||
          normalize(item.id) === normalizedPrimary
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