import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");

    const filePath = path.join(process.cwd(), "data", "diagnoses.json");
    const fileData = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(fileData);

    // Mulighed for ?keyword=autisme
    const { keyword } = req.query;
    if (keyword) {
      const result = data.filter((d) =>
        d.navn.toLowerCase().includes(keyword.toLowerCase())
      );
      res.status(200).json(result);
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Fejl ved indlæsning af diagnosebibliotek" });
  }
}
