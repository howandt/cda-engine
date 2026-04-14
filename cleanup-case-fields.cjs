const fs = require("fs");
const path = require("path");

const casesDir = path.join(__dirname, "public", "CDA", "cases");

const files = fs
  .readdirSync(casesDir)
  .filter((file) => file.toLowerCase().endsWith(".json"));

for (const file of files) {
  const filePath = path.join(casesDir, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed.cases)) {
    parsed.cases = parsed.cases.map((item) => {
      const cleaned = { ...item };
      delete cleaned.category;
      delete cleaned.shortDescription;
      return cleaned;
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
  console.log(`Renset: ${file}`);
}

console.log("Færdig.");