import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function readHeidiPrompt() {
  const promptPath = path.join(process.cwd(), "CDA_HeidiPrompt.md");

  if (!fs.existsSync(promptPath)) {
    throw new Error("CDA_HeidiPrompt.md blev ikke fundet");
  }

  return fs.readFileSync(promptPath, "utf8");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY mangler",
    });
  }

  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Feltet message mangler",
    });
  }

  try {
    const heidiPrompt = readHeidiPrompt();

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      reasoning: {
        effort: "minimal",
      },
      instructions: heidiPrompt,
      input: message,
      max_output_tokens: 800,
    });

    return res.status(200).json({
      success: true,
      reply: response.output_text,
      model: "gpt-5-mini",
    });
  } catch (error) {
    console.error("CDA chatfejl:", error);

    return res.status(500).json({
      success: false,
      error: "CDA kunne ikke behandle beskeden",
      details: error.message,
    });
  }
}