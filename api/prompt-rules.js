import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const filePath = path.join(process.cwd(), "data", "prompt_rules.json");
    const data = readJsonFile(filePath);

    const { section } = req.query;

    if (section) {
      const sectionData = data?.system_rules?.[section];

      if (!sectionData) {
        return res.status(404).json({
          error: `Sektion ikke fundet: ${section}`
        });
      }

      return res.status(200).json({
        section,
        data: sectionData
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Kunne ikke hente prompt-regler",
      details: error.message
    });
  }
}