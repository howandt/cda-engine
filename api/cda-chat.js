import fs from "fs";
import path from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function readTextFile(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage);
  }

  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile(filePath, errorMessage) {
  const raw = readTextFile(filePath, errorMessage);
  return JSON.parse(raw);
}

function readHeidiPrompt() {
  const promptPath = path.join(process.cwd(), "CDA_HeidiPrompt.md");

  return readTextFile(
    promptPath,
    "CDA_HeidiPrompt.md blev ikke fundet"
  );
}

function getPromptRules(args = {}) {
  const filePath = path.join(
    process.cwd(),
    "data",
    "prompt_rules.json"
  );

  const data = readJsonFile(
    filePath,
    "data/prompt_rules.json blev ikke fundet"
  );

  const section = args.section?.trim();

  if (!section) {
    return data;
  }

  const sectionData = data?.system_rules?.[section];

  if (!sectionData) {
    return {
      error: `Sektion ikke fundet: ${section}`,
    };
  }

  return {
    section,
    data: sectionData,
  };
}

const tools = [
  {
    type: "function",
    name: "getPromptRules",
    description:
      "Henter dynamiske prompt-regler til CDA. Bruges ved behov for styrende systemregler, mode-styring, rollespil, konfliktflow eller anden CDA-logik.",
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description:
            "Valgfri sektion, fx comorbidity_rules, practice_situations eller conflict_mediator_rules.",
        },
      },
      additionalProperties: false,
    },
    strict: false,
  },
];

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

    let response = await openai.responses.create({
      model: "gpt-5-mini",
      reasoning: {
        effort: "minimal",
      },
      instructions: heidiPrompt,
      input: message,
      tools,
      max_output_tokens: 1000,
    });

    const toolCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (toolCalls.length > 0) {
      const toolOutputs = toolCalls.map((toolCall) => {
        let result;

        try {
          const args = JSON.parse(toolCall.arguments || "{}");

          if (toolCall.name === "getPromptRules") {
            result = getPromptRules(args);
          } else {
            result = {
              error: `Ukendt funktion: ${toolCall.name}`,
            };
          }
        } catch (error) {
          result = {
            error: "Funktionen kunne ikke udføres",
            details: error.message,
          };
        }

        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(result),
        };
      });

      response = await openai.responses.create({
        model: "gpt-5-mini",
        reasoning: {
          effort: "minimal",
        },
        instructions: heidiPrompt,
        previous_response_id: response.id,
        input: toolOutputs,
        tools,
        max_output_tokens: 1000,
      });
    }

    return res.status(200).json({
      success: true,
      reply: response.output_text,
      model: "gpt-5-mini",
      tools_used: toolCalls.map((toolCall) => toolCall.name),
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