import fs from "fs";
import path from "path";

const casesDir = path.join("public", "cases");
const outputDir = path.join("public", "data");
const outputFile = path.join(outputDir, "cases_index.json");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const files = fs.readdirSync(casesDir);
const result = [];

for (const file of files) {
  const filePath = path.join(casesDir, file);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) continue;

  const content = fs.readFileSync(filePath, "utf8");

  const type = /ADHD|Autisme|Angst/i.test(file) ? "diagnosis" : "case";
  const titleMatch = content.match(/^#\s*(.*)/m);
  const title = titleMatch ? titleMatch[1].trim() : file;

  result.push({
    id: file.replace(".md", ""),
    file: file,
    type,
    title,
  });
}

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");
console.log(`✅ cases_index.json genereret med ${result.length} filer.`);
