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
    const data = readJsonFile(dataPath);

    return res.status(200).json({
      success: true,
      source: "local",
      data,
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