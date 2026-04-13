import { routeBornehaveInput } from "../lib/bornehaveRouter.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      allowed_methods: ["GET"]
    });
  }

  try {
    const text = req.query.text || "";
    const age = req.query.age ? Number(req.query.age) : null;
    const category = req.query.category || "";
    const detailLevel = String(req.query.detail || "kort").toLowerCase();

    const tags = req.query.tags
      ? String(req.query.tags)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const routing = routeBornehaveInput({
      text,
      age,
      category,
      tags
    });

    const shortRouting = {
      module: routing.module,
      version: routing.version,
      entry_template: routing.entry_template,
      base_template: routing.base_template,
      primary_template: routing.primary_template,
      flow_templates: routing.flow_templates,
      matched_behavior_tags: routing.matched_behavior_tags,
      matched_category: routing.matched_category,
      age: routing.age,
      handover_ready: routing.handover_ready,
      handover_template: routing.handover_template,
      candidate_templates: routing.candidate_templates,
      priority_templates: routing.priority_templates
    };

    const longRouting = {
      ...shortRouting,
      primary_template_object: routing.primary_template_object,
      flow_template_objects: routing.flow_template_objects
    };

    return res.status(200).json({
      success: true,
      input: {
        text,
        age,
        category,
        tags,
        detail: detailLevel
      },
      routing: detailLevel === "lang" ? longRouting : shortRouting
    });
  } catch (error) {
    console.error("Bornehave router error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to route bornehave input",
      message: error.message
    });
  }
}