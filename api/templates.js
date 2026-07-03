import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function countRegisteredFiles(registry) {
  const categoryFiles = Array.isArray(registry.categories)
    ? registry.categories.reduce(
        (total, category) =>
          total + (Array.isArray(category.files) ? category.files.length : 0),
        0
      )
    : 0;

  const standaloneFiles = Array.isArray(registry.standalone)
    ? registry.standalone.length
    : 0;

  return categoryFiles + standaloneFiles;
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

    /*
     * Nyt statisk Markdown-register.
     *
     * Kald:
     *   GET /api/templates?type=files
     *
     * Dette bruges senere af dropdown-menuen og ændrer ikke den eksisterende
     * standardsvarform fra /api/templates eller ?type=index.
     */
    if (type === "files") {
      const registryPath = path.join(
        process.cwd(),
        "data",
        "CDA_TemplateFiles.json"
      );
      const registry = readJsonFile(registryPath);

      return res.status(200).json({
        success: true,
        source: "local",
        registry,
        categories: Array.isArray(registry.categories)
          ? registry.categories
          : [],
        standalone: Array.isArray(registry.standalone)
          ? registry.standalone
          : [],
        total: countRegisteredFiles(registry),
      });
    }

    /*
     * Eksisterende skabelonbank.
     * Bevares uændret af hensyn til nuværende routing og integrationer.
     */
    const templatesPath = path.join(
      process.cwd(),
      "data",
      "CDA_Templates.json"
    );
    const data = readJsonFile(templatesPath);

    const templateDatabase = data.template_database || data;
    const templates = Array.isArray(templateDatabase.templates)
      ? templateDatabase.templates
      : [];
    const metadata = templateDatabase.metadata || {};
    const searchIndex =
      templateDatabase.search_index ||
      data.search_index ||
      {};

    if (type === "index") {
      return res.status(200).json({
        success: true,
        source: "local",
        data: searchIndex,
      });
    }

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
