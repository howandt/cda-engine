import { getRollespil } from "../lib/roleplayEngine.js";

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
    const result = getRollespil({
      caseId: req.query?.caseId,
    });

    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    console.error("Rollespil API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load rollespil data",
      message: error.message,
    });
  }
}
