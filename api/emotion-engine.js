// api/emotion-engine.js
// CDA Emotion Engine API - Analyser voksnes sprog til børn

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Fetch emotion engine data from GitHub
    const response = await fetch(
      'https://raw.githubusercontent.com/howandt/cda-engine-clean/refs/heads/main/data/CDA_Emotionengine.json',
      {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'public, max-age=3600' // Cache 1 hour
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status}`);
    }

    const data = await response.json();

    // GET: Return emotion engine data and examples
    if (req.method === 'GET') {
      return res.status(200).json({
        version: data.version,
        description: data.description,
        purpose: data.purpose,
        word_categories: data.word_categories,
        mood_levels: data.mood_levels,
        examples: data.examples,
        improvement_suggestions: data.improvement_suggestions,
        communication_tips: data.communication_tips
      });
    }

    // POST: Analyze text communication
    if (req.method === 'POST') {
      const { text, context } = req.body;

      if (!text) {
        return res.status(400).json({ 
          error: 'Missing required field: text' 
        });
      }

      // Analyze the text
      const analysis = analyzeEmotion(text, data);

      // Find similar examples
      const similarExamples = findSimilarExamples(text, data.examples);

      // Get improvement suggestions
      const improvements = getImprovements(text, analysis, data);

      return res.status(200).json({
        input: {
          text: text,
          context: context || null
        },
        analysis: analysis,
        similar_examples: similarExamples,
        improvements: improvements,
        communication_tips: data.communication_tips
      });
    }

  } catch (error) {
    console.error('Emotion Engine API Error:', error);
    res.status(500).json({ 
      error: 'Failed to process emotion analysis',
      details: error.message 
    });
  }
}

// Analyze emotion in text
function analyzeEmotion(text, data) {
  let score = 0;
  const textLower = text.toLowerCase();
  const foundWords = {
    positive: [],
    negative: [],
    empathy: [],
    commands: [],
    validating: []
  };

  // Check positive words
  data.word_categories.positive.words.forEach(word => {
    if (textLower.includes(word)) {
      score += data.word_categories.positive.score_value;
      foundWords.positive.push(word);
    }
  });

  // Check negative words
  data.word_categories.negative.words.forEach(word => {
    if (textLower.includes(word)) {
      score += data.word_categories.negative.score_value;
      foundWords.negative.push(word);
    }
  });

  // Check empathy phrases
  data.word_categories.empathy.phrases.forEach(phrase => {
    if (textLower.includes(phrase)) {
      score += data.word_categories.empathy.score_value;
      foundWords.empathy.push(phrase);
    }
  });

  // Check commands
  data.word_categories.commands.phrases.forEach(phrase => {
    if (textLower.includes(phrase)) {
      score += data.word_categories.commands.score_value;
      foundWords.commands.push(phrase);
    }
  });

  // Check validating phrases
  data.word_categories.validating.phrases.forEach(phrase => {
    if (textLower.includes(phrase)) {
      score += data.word_categories.validating.score_value;
      foundWords.validating.push(phrase);
    }
  });

  // Determine mood
  let mood = "neutral";
  let moodData = data.mood_levels.neutral;

  if (score >= 3) {
    mood = "støttende";
    moodData = data.mood_levels.støttende;
  } else if (score >= 1) {
    mood = "rolig";
    moodData = data.mood_levels.rolig;
  } else if (score <= -2) {
    mood = "pres";
    moodData = data.mood_levels.pres;
  } else if (score < 0) {
    mood = "spændt";
    moodData = data.mood_levels.spændt;
  }

  return {
    score: score,
    mood: mood,
    emoji: moodData.emoji,
    description: moodData.description,
    effect_on_child: moodData.effect_on_child,
    characteristics: moodData.characteristics,
    found_elements: foundWords,
    word_count: {
      positive: foundWords.positive.length,
      negative: foundWords.negative.length,
      empathy: foundWords.empathy.length,
      commands: foundWords.commands.length,
      validating: foundWords.validating.length
    }
  };
}

// Find similar examples
function findSimilarExamples(text, examples) {
  const textLower = text.toLowerCase();
  const matches = [];

  examples.forEach(example => {
    const badWords = example.bad_communication.toLowerCase().split(' ');
    const matchCount = badWords.filter(word => textLower.includes(word)).length;
    
    if (matchCount > 2) {
      matches.push({
        situation: example.situation,
        your_communication: text,
        similar_to: example.bad_communication,
        better_alternative: example.good_communication,
        why_better: example.analysis_good.strengths
      });
    }
  });

  return matches.slice(0, 2); // Return max 2 examples
}

// Get improvement suggestions
function getImprovements(text, analysis, data) {
  const suggestions = [];
  const textLower = text.toLowerCase();

  // Check for specific patterns to improve
  if (textLower.includes('skal')) {
    suggestions.push({
      problem: "Bruger 'skal' - kan opleves som krav",
      suggestion: data.improvement_suggestions.replace_skal.use_instead,
      category: "kommando"
    });
  }

  if (textLower.includes('stop') || textLower.includes('hold op')) {
    suggestions.push({
      problem: "Bruger 'stop' eller 'hold op' - kan opleves som afvisning",
      suggestion: data.improvement_suggestions.replace_stop.use_instead,
      category: "kommando"
    });
  }

  if (textLower.includes('hvorfor')) {
    suggestions.push({
      problem: "Bruger 'hvorfor' - kan opleves som kritik",
      suggestion: data.improvement_suggestions.replace_hvorfor.use_instead,
      category: "spørgsmål"
    });
  }

  if (textLower.includes('dum') || textLower.includes('forkert')) {
    suggestions.push({
      problem: "Bruger kritiske ord - kan skabe skam",
      suggestion: data.improvement_suggestions.replace_criticism.use_instead,
      category: "kritik"
    });
  }

  // General improvements based on mood
  if (analysis.mood === 'pres' || analysis.mood === 'spændt') {
    suggestions.push({
      problem: `Din kommunikation scorer som '${analysis.mood}' - barnet kan føle pres`,
      suggestion: [
        "Start med empati: 'Jeg kan se...'",
        "Anerkend følelser først",
        "Tilbyd samarbejde i stedet for kommando",
        "Giv tid og rum"
      ],
      category: "generel forbedring"
    });
  }

  if (analysis.word_count.empathy === 0 && analysis.word_count.validating === 0) {
    suggestions.push({
      problem: "Ingen empatiske eller validerende elementer fundet",
      suggestion: [
        "Tilføj: 'Jeg kan se/høre...'",
        "Anerkend følelsen: 'Det må være svært'",
        "Valider: 'Det er ok at føle sådan'",
        "Vis forståelse: 'Det giver mening'"
      ],
      category: "empati"
    });
  }

  return suggestions;
}