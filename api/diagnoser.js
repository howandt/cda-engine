import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
      allowed_methods: ["GET"],
    });
  }

  try {
    const { id, kategori, search, komorbiditet } = req.query;

    const dataPath = path.join(process.cwd(), "data", "CDA_Diagnoser.json");

    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({
        error: "Datafil ikke fundet",
        path: dataPath,
      });
    }

    const raw = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(raw);
    const diagnoser = Array.isArray(data.diagnoser) ? data.diagnoser : [];

    if (id) {
      const diagnose = diagnoser.find(
        (d) => String(d.id || "").toLowerCase() === String(id).toLowerCase()
      );

      if (!diagnose) {
        return res.status(404).json({
          error: "Diagnose ikke fundet",
          requested_id: id,
          available_ids: diagnoser.map((d) => d.id),
        });
      }

      return res.status(200).json({
        version: data.version || null,
        diagnose,
      });
    }

    let filteredDiagnoser = [...diagnoser];

    if (kategori) {
      filteredDiagnoser = filteredDiagnoser.filter((d) =>
        String(d.kategori || "")
          .toLowerCase()
          .includes(String(kategori).toLowerCase())
      );
    }

    if (komorbiditet) {
      filteredDiagnoser = filteredDiagnoser.filter((d) => {
        if (!Array.isArray(d.komorbiditet_links)) return false;

        return d.komorbiditet_links.some((link) =>
          String(link).toLowerCase().includes(String(komorbiditet).toLowerCase())
        );
      });
    }

    if (search) {
      const q = String(search).trim().toLowerCase();

      const scoreDiagnose = (d) => {
        let score = 0;

        const idValue = String(d.id || "").toLowerCase();
        const navnValue = String(d.navn || "").toLowerCase();
        const fuldNavnValue = String(d.fuld_navn || "").toLowerCase();
        const kategoriValue = String(d.kategori || "").toLowerCase();

        if (idValue === q) score += 100;
        else if (idValue.includes(q)) score += 40;

        if (navnValue === q) score += 90;
        else if (navnValue.includes(q)) score += 35;

        if (fuldNavnValue === q) score += 80;
        else if (fuldNavnValue.includes(q)) score += 25;

        if (
          Array.isArray(d.noegleord) &&
          d.noegleord.some((n) => String(n).toLowerCase() === q)
        ) {
          score += 20;
        } else if (
          Array.isArray(d.noegleord) &&
          d.noegleord.some((n) => String(n).toLowerCase().includes(q))
        ) {
          score += 10;
        }

        if (kategoriValue === q) score += 8;
        else if (kategoriValue.includes(q)) score += 3;

        return score;
      };

      filteredDiagnoser = filteredDiagnoser
        .map((d) => ({ ...d, _score: scoreDiagnose(d) }))
        .filter((d) => d._score > 0)
        .sort((a, b) => b._score - a._score)
        .map(({ _score, ...rest }) => rest);
    }

    return res.status(200).json({
      version: data.version || null,
      description: data.description || null,
      total_diagnoser: diagnoser.length,
      filtered_count: filteredDiagnoser.length,
      filters_applied: {
        id: id || null,
        kategori: kategori || null,
        search: search || null,
        komorbiditet: komorbiditet || null,
      },
      diagnoser: filteredDiagnoser,
    });
  } catch (error) {
    console.error("API Error:", error);

    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}