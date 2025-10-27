export const config = { runtime: "nodejs" };
import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    // Tillad adgang fra andre systemer (CDA, CDT, GPT osv.)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    // Find og læs template index filen
    const filePath = path.join(process.cwd(), "data", "CDA_Templates", "cda_templates_index.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(fileData);

    // Hvis ingen query-parametre, returnér hele biblioteket
    const { category, keyword } = req.query;

    if (!category && !keyword) {
      return res.status(200).json(data);
    }

    // Søgning efter kategori
    if (category) {
      const match = data.categories.find(
        c => c.category.toLowerCase() === category.toLowerCase()
      );
      if (!match) return res.status(404).json({ error: "Kategori ikke fundet" });
      return res.status(200).json(match);
    }

    // Søgning efter keyword (i id, title, eller purpose)
    if (keyword) {
      const lower = keyword.toLowerCase();
      const results = [];

      data.categories.forEach(cat => {
        cat.templates.forEach(tpl => {
          if (
            tpl.id.toLowerCase().includes(lower) ||
            tpl.title.toLowerCase().includes(lower) ||
            tpl.purpose.toLowerCase().includes(lower)
          ) {
            results.push({ ...tpl, category: cat.category });
          }
        });
      });

      if (results.length === 0) {
        return res.status(200).json({ results: [], message: "Ingen match fundet" });
      }

      return res.status(200).json({ results });
    }

  } catch (error) {
    console.error("FEJL I TEMPLATE API:", error);
    res.status(500).json({ error: "Der opstod en fejl i Template API'en" });
  }
}
