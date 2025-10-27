export const config = { runtime: "nodejs" };
import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    // Tillad adgang fra CDA, CDT, GPT osv.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    // Find og læs filen korrekt
    const filePath = path.join(process.cwd(), "data", "templates.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(fileData);

    const { keyword } = req.query;

    // Hvis der søges efter et keyword
    if (keyword) {
      const term = keyword.toLowerCase();
      const results = [];

      data.categories.forEach(category => {
        category.templates.forEach(template => {
          if (
            template.id.toLowerCase().includes(term) ||
            template.title.toLowerCase().includes(term) ||
            (template.purpose && template.purpose.toLowerCase().includes(term))
          ) {
            results.push({
              category: category.category,
              ...template
            });
          }
        });
      });

      return res.status(200).json({ results });
    }

    // Returnér hele datafilen hvis ingen søgning
    res.status(200).json(data);
  } catch (err) {
    console.error("FEJL I API:", err);
    res.status(500).json({ error: err.message });
  }
}
