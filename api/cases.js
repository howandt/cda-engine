import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const { id, category, diagnose, miljø, age, search, sort } = req.query;

    // 🔹 Hent den rensede index-fil
    const dataPath = path.join(process.cwd(), "public", "data", "CDA_Cases_Index_clean.json");

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({
        success: false,
        error: `Datafil ikke fundet: ${dataPath}`
      });
    }

    const raw = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(raw);
    const cases = data.cases || data;

    // 🔍 Hvis der søges på specifikt ID
    if (id) {
      const match = cases.find(c => c.id?.toLowerCase() === id.toLowerCase());
      if (!match) {
        return res.status(404).json({
          success: false,
          error: `Ingen case fundet med ID: ${id}`
        });
      }
      return res.status(200).json({
        success: true,
        total: 1,
        source: JSON.stringify(match, null, 2)
      });
    }

    // 🔍 Ellers filtrer på kategori, diagnose, miljø, alder
    let filtered = cases;

    if (category) {
      filtered = filtered.filter(c =>
        c.category?.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (diagnose) {
      filtered = filtered.filter(c =>
        c.diagnoses?.some(d =>
          d.toLowerCase().includes(diagnose.toLowerCase())
        )
      );
    }

    if (miljø) {
      filtered = filtered.filter(c =>
        c.miljø?.toLowerCase().includes(miljø.toLowerCase())
      );
    }

    if (age) {
      filtered = filtered.filter(c => c.age === Number(age));
    }

    // 🔎 NY: Fritekst-søgning
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.theme && c.theme.toLowerCase().includes(q)) ||
        (c.problem && c.problem.toLowerCase().includes(q)) ||
        (c.solution && c.solution.toLowerCase().includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q))
      );
    }

    // 🧭 NY: Sortering
    if (sort) {
      const dir = sort.toLowerCase();
      if (dir === "age-asc") filtered.sort((a, b) => a.age - b.age);
      if (dir === "age-desc") filtered.sort((a, b) => b.age - a.age);
      if (dir === "title") filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    // ✅ Returnér resultatet
    return res.status(200).json({
      success: true,
      total: filtered.length,
      source: JSON.stringify(filtered, null, 2)
    });

  } catch (error) {
    console.error("❌ FEJL i /api/cases:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
