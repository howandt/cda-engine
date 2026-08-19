import OpenAI from "openai";
import { runRoleplayChatRequest } from "../lib/roleplayEngine.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      allowed_methods: ["POST"],
    });
  }

  const result = await runRoleplayChatRequest({
    openai,
    body: req.body || {},
  });

  return res.status(result.statusCode).json(result.body);
}
