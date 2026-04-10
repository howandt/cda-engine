import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const dataPath = path.join(process.cwd(), "data", "CDA_PBL_Projects.json");
    const data = readJsonFile(dataPath);

    const {
      diagnosis,
      level,
      social,
      structure,
      stimuli,
      id,
    } = req.query;

    let projects = Array.isArray(data.projects) ? [...data.projects] : [];

    if (id) {
      const project = projects.find((p) => String(p.id || "") === String(id));

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      return res.status(200).json({
        version: data.version || null,
        project,
      });
    }

    if (diagnosis) {
      const diagnosisArray = String(diagnosis)
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      projects = projects.filter(
        (p) =>
          diagnosisArray.some(
            (d) =>
              Array.isArray(p.diagnosis_match) &&
              p.diagnosis_match.some((dm) =>
                String(dm).toLowerCase().includes(d.toLowerCase())
              )
          )
      );
    }

    if (level) {
      projects = projects.filter(
        (p) =>
          String(p.level || "").toLowerCase() === String(level).toLowerCase()
      );
    }

    if (social) {
      projects = projects.filter(
        (p) =>
          String(p.social_exposure || "").toLowerCase() ===
          String(social).toLowerCase()
      );
    }

    if (structure) {
      projects = projects.filter(
        (p) =>
          String(p.structure_need || "").toLowerCase() ===
          String(structure).toLowerCase()
      );
    }

    if (stimuli) {
      const stimuliArray = String(stimuli)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      projects = projects.filter(
        (p) =>
          stimuliArray.some(
            (s) =>
              Array.isArray(p.stimuli_type) &&
              p.stimuli_type.some((st) =>
                String(st).toLowerCase().includes(s.toLowerCase())
              )
          )
      );
    }

    return res.status(200).json({
      version: data.version || null,
      total_projects: data.total_projects || projects.length,
      filtered_count: projects.length,
      filters_applied: {
        diagnosis: diagnosis || null,
        level: level || null,
        social: social || null,
        structure: structure || null,
        stimuli: stimuli || null,
      },
      projects,
      filter_categories: data.filter_categories || null,
      teacher_templates: data.teacher_templates || null,
      matching_algorithm: data.matching_algorithm || null,
    });
  } catch (error) {
    console.error("PBL API Error:", error);

    return res.status(500).json({
      error: "Failed to load PBL projects",
      details: error.message,
    });
  }
}