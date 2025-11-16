// lib/emotionEngine.js
export function analyseEmotion(sentence = "") {
  const positive = ["roligt", "hjælpe", "tak", "godt", "kan se", "pause", "forstå"];
  const negative = ["skal", "nu", "stop", "hold op", "aldrig", "dum", "sur", "hvorfor"];
  const empathy = ["jeg forstår", "jeg kan se", "det må være svært"];

  let score = 0;
  const text = sentence.toLowerCase();

  positive.forEach(w => { if (text.includes(w)) score += 1; });
  negative.forEach(w => { if (text.includes(w)) score -= 1; });
  empathy.forEach(w => { if (text.includes(w)) score += 2; });

  let mood = "neutral";
  if (score >= 3) mood = "støttende";
  else if (score >= 1) mood = "rolig";
  else if (score <= -2) mood = "pres";
  else if (score < 0) mood = "spændt";

  return { score, mood };
}
