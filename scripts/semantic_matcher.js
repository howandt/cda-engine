import fs from "fs";
import path from "path";

// 🔹 Simpel semantisk matcher
export function semanticSearch(query) {
  try {
    const semanticPath = path.join(process.cwd(), "public", "data", "semantic_engine.json");
    if (!fs.existsSync(semanticPath)) return { terms: [], related: [] };

    const raw = fs.readFileSync(semanticPath, "utf8");
    const semantic = JSON.parse(raw);

    const terms = query.toLowerCase().split(/\s+/);
    const related = new Set();

    for (const term of terms) {
      for (const [key, value] of Object.entries(semantic)) {
        if (term.includes(key.toLowerCase()) || key.toLowerCase().includes(term)) {
          value.forEach(v => related.add(v.toLowerCase()));
        }
      }
    }

    return { terms, related: Array.from(related) };
  } catch (err) {
    console.error("❌ Semantic matcher fejl:", err);
    return { terms: [], related: [] };
  }
}
