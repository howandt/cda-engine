import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { query } = req;
    const searchText = query.search?.toLowerCase() || "";

    if (!searchText) {
      return res.status(400).json({
        success: false,
        error: "Ingen søgetekst angivet. Brug ?search=..."
      });
    }

    // 🔹 Hent datafiler
    const casesPath = path.join(process.cwd(), "public", "data", "CDA_Cases_Index_clean.json");
    const semanticPath = path.join(process.cwd(), "public", "data", "semantic_engine.json");

    if (!fs.existsSync(casesPath) || !fs.existsSync(semanticPath)) {
      return res.status(404).json({
        success: false,
        error: "Datafiler ikke fundet."
      });
    }

    const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
    const semantic = JSON.parse(fs.readFileSync(semanticPath, "utf8"));

    const caseList = cases.cases || cases;

    // 🔍 Trin 1: Omsæt søgetekst via semantiske synonymer
    let searchTerms = [searchText];
    for (const [key, values] of Object.entries(semantic.synonyms)) {
      for (const term of values) {
        if (searchText.includes(term.toLowerCase())) searchTerms.push(key.toLowerCase());
      }
    }

    // 🔍 Trin 2: Match mod casefelter
    const matchedCases = caseList.filter(c => {
      const text = `${c.title} ${c.theme} ${c.problem} ${c.category} ${c.diagnoses?.join(" ")}`.toLowerCase();
      return searchTerms.some(term => text.includes(term));
    });

    // 🔹 Trin 3: Returnér resultater
    return res.status(200).json({
      success: true,
      query: searchText,
      matches: matchedCases.length,
      results: matchedCases.slice(0, 20), // begræns til 20 for hurtighed
      terms_used: searchTerms
    });

  } catch (error) {
    console.error("❌ FEJL i /api/semantic-search:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
