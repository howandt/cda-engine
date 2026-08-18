import {
  getEmotionAnalysis,
  getEmotionDataset,
} from "../lib/emotionEngine.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(getEmotionDataset());
    }

    const { text, context } = req.body || {};
    if (!text) {
      return res.status(400).json({
        error: "Missing required field: text",
      });
    }

    return res.status(200).json(
      getEmotionAnalysis({
        text,
        context: context || null,
      })
    );
  } catch (error) {
    console.error("Emotion Engine API Error:", error);

    return res.status(500).json({
      error: "Failed to process emotion analysis",
      details: error.message,
    });
  }
}
