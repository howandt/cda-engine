import fs from "fs";

// Input- og output-stier
const inputPath = "./public/data/CDA_Cases_Index.json";
const outputPath = "./public/data/CDA_Cases_Index_clean.json";

// Indlæs JSON-data
const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// Kategoridetektion – intelligent fallback
function detectCategory(id, title = "", diagnoses = []) {
  const text = `${id} ${title} ${diagnoses.join(" ")}`.toLowerCase();

  if (text.includes("adhd") && text.includes("angst")) return "ADHD & Angst";
  if (text.includes("adhd")) return "ADHD";
  if (text.includes("autisme")) return "Autisme";
  if (text.includes("angst")) return "Angst";
  if (text.includes("børnehave")) return "Børnehave";
  if (text.includes("mobning")) return "Mobning & Sociale dynamikker";
  if (text.includes("overgang") || text.includes("skolestart"))
    return "Transition & Organisation";

  return "Ukendt"; // behold, men marker som ukendt
}

// Rens og berig data
const clean = data
  .filter(item => item.id) // behold alle cases der har id
  .map(item => ({
    ...item,
    category: detectCategory(item.id, item.title, item.diagnoses),
    shortDescription:
      item.shortDescription ||
      item.problem?.slice(0, 150)?.replace(/\n/g, " ") + "..."
  }));

// Beregn statistik
const breakdown = clean.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] || 0) + 1;
  return acc;
}, {});

// Gem resultat
fs.writeFileSync(outputPath, JSON.stringify(clean, null, 2), "utf8");

console.log("✅ CLEAN INDEX BUILT SUCCESSFULLY!");
console.log("📦 Total cases:", clean.length);
console.log("📊 Category breakdown:", breakdown);
console.log("📁 Output:", outputPath);
