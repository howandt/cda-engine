export const config = { runtime: "nodejs" };
import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    // Tillad adgang fra GPT og andre systemer
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Find JSON-filen i projektmappen
    const filePath = path.join(process.cwd(), "CDA_SpecialistPanel.json");

    // Læs og parse JSON-indholdet
    const fileData = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(fileData);

    // Hent evt. søgeord
    const { keyword, debug } = req.query;

    // Hvis debug=true, vis hurtig info
    if (debug === "true") {
      res.setHeader("Content-Type", "text/plain");
      return res
        .status(200)
        .send(`DEBUG: keyword = ${keyword}\nData indeholder ${data.specialists.length} specialister`);
    }

    // Hvis der er et keyword, filtrer specialister
    if (keyword) {
      // --- SEMANTISK UDVIKLING ---
      const rawTerms = keyword.toLowerCase().split(/\s+/);

      const synonymMap = {
        "søvn": [
          "sover", "søvnritual", "søvnmønster", "søvnforstyrrelse",
          "søvnrytme", "søvnbesvær", "træthed", "insomni"
        ],
        "autisme": [
          "asd", "autist", "autistisk", "neurodiversitet", "rigiditet",
          "sensorisk", "masking", "overstimulering"
        ],
        "adhd": [
          "opmærksomhed", "impulsivitet", "hyperaktiv", "rastløs", "fokus", "koncentration"
        ],
        "uro": ["rastløs", "motorisk", "urolig", "impulsiv"],
        "angst": ["bekymring", "frygt", "nervøsitet", "stress"],
        "struktur": ["rutine", "forudsigelighed", "skema", "plan"],
        "sensorik": ["sansning", "overstimulering", "følsomhed"]
      };

      // Udvid brugers søgeord med synonym-grupper
      let searchTerms = [];
      for (const term of rawTerms) {
        searchTerms.push(term);
        if (synonymMap[term]) {
          searchTerms = searchTerms.concat(synonymMap[term]);
        }
      }

      // --- SCORING AF MATCHES ---
      const scored = data.specialists.map(spec => {
        const allKeywords = (spec.keywords || []).map(k => k.toLowerCase());
        let score = 0;

        // Tildel point for hver delvist eller eksakt match
        for (const term of searchTerms) {
          for (const k of allKeywords) {
            const kw = k.toLowerCase();
            if (kw === term) score += 1; // eksakt
            else if (kw.includes(term) || term.includes(kw)) score += 0.75; // delvist
          }
        }

        // Straf meget brede profiler
        if (allKeywords.length > 40) score = score / 2;
        if (allKeywords.length > 60) score = score / 3;

        return { ...spec, matchScore: score };
      });

      // --- SORTERING & UDVALG ---
      const topMatches = scored
        .filter(s => s.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 4);

      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(JSON.stringify({ topMatches }, null, 2));
    }

    // Hvis ingen keyword - returnér hele JSON som tekst
    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(JSON.stringify(data, null, 2));

  } catch (error) {
    // 👇 Udvidet fejlrapport direkte i browser
    const message = [
      "FEJL I API:",
      error.message || error.toString(),
      error.stack || ""
    ].join("\n");

    res.setHeader("Content-Type", "text/plain");
    res.status(500).send(message);
  }
}
