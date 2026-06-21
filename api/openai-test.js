import OpenAI from "openai";

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
      error: "Method not allowed",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY mangler",
    });
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: "Svar kun med teksten: CDA OpenAI-forbindelse virker.",
      max_output_tokens: 30,
    });

    return res.status(200).json({
      success: true,
      message: response.output_text,
      model: "gpt-5-mini",
    });
  } catch (error) {
    console.error("OpenAI testfejl:", error);

    return res.status(500).json({
      success: false,
      error: "OpenAI-forbindelsen fejlede",
      details: error.message,
    });
  }
}