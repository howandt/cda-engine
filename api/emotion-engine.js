import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function analyzeEmotion(text, data) {
  let score = 0;
  const textLower = String(text || "").toLowerCase();

  const foundWords = {
    positive: [],
    negative: [],
    empathy: [],
    commands: [],
    validating: [],
  };

  const wordCategories = data.word_categories || {};

  if (wordCategories.positive?.words) {
    wordCategories.positive.words.forEach((word) => {
      if (textLower.includes(String(word).toLowerCase())) {
        score += Number(wordCategories.positive.score_value || 0);
        foundWords.positive.push(word);
      }
    });
  }

  if (wordCategories.negative?.words) {
    wordCategories.negative.words.forEach((word) => {
      if (textLower.includes(String(word).toLowerCase())) {
        score += Number(wordCategories.negative.score_value || 0);
        foundWords.negative.push(word);
      }
    });
  }

  if (wordCategories.empathy?.phrases) {
    wordCategories.empathy.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.empathy.score_value || 0);
        foundWords.empathy.push(phrase);
      }
    });
  }

  if (wordCategories.commands?.phrases) {
    wordCategories.commands.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.commands.score_value || 0);
        foundWords.commands.push(phrase);
      }
    });
  }

  if (wordCategories.validating?.phrases) {
    wordCategories.validating.phrases.forEach((phrase) => {
      if (textLower.includes(String(phrase).toLowerCase())) {
        score += Number(wordCategories.validating.score_value || 0);
        foundWords.validating.push(phrase);
      }
    });
  }

  let mood = "neutral";
  let moodData = data.mood_levels?.neutral || {};

  if (score >= 3) {
    mood = "støttende";
    moodData = data.mood_levels?.støttende || {};
  } else if (score >= 1) {
    mood = "rolig";
    moodData = data.mood_levels?.rolig || {};
  } else if (score <= -2) {
    mood = "pres";
    moodData = data.mood_levels?.pres || {};
  } else if (score < 0) {
    mood = "spændt";
    moodData = data.mood_levels?.spændt || {};
  }

  return {
    score,
    mood,
    emoji: moodData.emoji || null,
    description: moodData.description || null,
    effect_on_child: moodData.effect_on_child || null,
    characteristics: moodData.characteristics || [],
    found_elements: foundWords,
    word_count: {
      positive: foundWords.positive.length,
      negative: foundWords.negative.length,
      empathy: foundWords.empathy.length,
      commands: foundWords.commands.length,
      validating: foundWords.validating.length,
    },
  };
}

function findSimilarExamples(text, examples) {
  const textLower = String(text || "").toLowerCase();
  const exampleList = Array.isArray(examples) ? examples : [];
  const matches = [];

  exampleList.forEach((example) => {
    const badText = String(example.bad_communication || "").toLowerCase();
    const badWords = badText.split(/\s+/).filter(Boolean);
    const matchCount = badWords.filter((word) => textLower.includes(word)).length;

    if (matchCount > 2) {
      matches.push({
        situation: example.situation || null,
        your_communication: text,
        similar_to: example.bad_communication || null,
        better_alternative: example.good_communication || null,
        why_better: example.analysis_good?.strengths || null,
      });
    }
  });

  return matches.slice(0, 2);
}

function getImprovements(text, analysis, data) {
  const suggestions = [];
  const textLower = String(text || "").toLowerCase();
  const improvementSuggestions = data.improvement_suggestions || {};

  if (textLower.includes("skal")) {
    suggestions.push({
      problem: "Bruger 'skal' - kan opleves som krav",
      suggestion: improvementSuggestions.replace_skal?.use_instead || [],
      category: "kommando",
    });
  }

  if (textLower.includes("stop") || textLower.includes("hold op")) {
    suggestions.push({
      problem: "Bruger 'stop' eller 'hold op' - kan opleves som afvisning",
      suggestion: improvementSuggestions.replace_stop?.use_instead || [],
      category: "kommando",
    });
  }

  if (textLower.includes("hvorfor")) {
    suggestions.push({
      problem: "Bruger 'hvorfor' - kan opleves som kritik",
      suggestion: improvementSuggestions.replace_hvorfor?.use_instead || [],
      category: "spørgsmål",
    });
  }

  if (textLower.includes("dum") || textLower.includes("forkert")) {
    suggestions.push({
      problem: "Bruger kritiske ord - kan skabe skam",
      suggestion: improvementSuggestions.replace_criticism?.use_instead || [],
      category: "kritik",
    });
  }

  if (analysis.mood === "pres" || analysis.mood === "spændt") {
    suggestions.push({
      problem: `Din kommunikation scorer som '${analysis.mood}' - barnet kan føle pres`,
      suggestion: [
        "Start med empati: 'Jeg kan se...'",
        "Anerkend følelser først",
        "Tilbyd samarbejde i stedet for kommando",
        "Giv tid og rum",
      ],
      category: "generel forbedring",
    });
  }

  if (analysis.word_count.empathy === 0 && analysis.word_count.validating === 0) {
    suggestions.push({
      problem: "Ingen empatiske eller validerende elementer fundet",
      suggestion: [
        "Tilføj: 'Jeg kan se/høre...'",
        "Anerkend følelsen: 'Det må være svært'",
        "Valider: 'Det er ok at føle sådan'",
        "Vis forståelse: 'Det giver mening'",
      ],
      category: "empati",
    });
  }

  return suggestions;
}

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
    const dataPath = path.join(process.cwd(), "data", "CDA_Emotionengine.json");
    const data = readJsonFile(dataPath);

    if (req.method === "GET") {
      return res.status(200).json({
        version: data.version || null,
        description: data.description || null,
        purpose: data.purpose || null,
        word_categories: data.word_categories || {},
        mood_levels: data.mood_levels || {},
        examples: data.examples || [],
        improvement_suggestions: data.improvement_suggestions || {},
        communication_tips: data.communication_tips || [],
      });
    }

    if (req.method === "POST") {
      const { text, context } = req.body || {};

      if (!text) {
        return res.status(400).json({
          error: "Missing required field: text",
        });
      }

      const analysis = analyzeEmotion(text, data);
      const similarExamples = findSimilarExamples(text, data.examples || []);
      const improvements = getImprovements(text, analysis, data);

      return res.status(200).json({
        input: {
          text,
          context: context || null,
        },
        analysis,
        similar_examples: similarExamples,
        improvements,
        communication_tips: data.communication_tips || [],
      });
    }
  } catch (error) {
    console.error("Emotion Engine API Error:", error);

    return res.status(500).json({
      error: "Failed to process emotion analysis",
      details: error.message,
    });
  }
}