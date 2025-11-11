import fs from "fs";

const inputPath = "./public/data/CDA_Cases_Index.json";
const outputPath = "./public/data/CDA_Cases_Index_clean.json";

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const clean = data.filter(item => item.id && item.id.startsWith("case-"));

fs.writeFileSync(outputPath, JSON.stringify(clean, null, 2), "utf8");

console.log(`✅ Done! ${clean.length} cases saved to CDA_Cases_Index_clean.json`);
