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
    const { type } = req.query;

    if (type === "index") {
      const indexPath = path.join(
        process.cwd(),
        "data",
        "CDA_Templates",
        "cda_templates_index.json"
      );

      const data = readJsonFile(indexPath);

      return res.status(200).json({
        success: true,
        source: "local",
        data,
      });
    }

    const templatesPath = path.join(process.cwd(), "data", "CDA_Templates.json");
    const data = readJsonFile(templatesPath);

    const templates = Array.isArray(data.template_database?.templates)
      ? data.template_database.templates
      : [];

    const metadata = data.template_database?.metadata || {};

    return res.status(200).json({
      success: true,
      source: "local",
      templates,
      metadata,
      total: templates.length,
    });
  } catch (error) {
    console.error("Templates API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load templates",
      message: error.message,
    });
  }
}