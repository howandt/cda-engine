import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function normalizeAccessCode(value) {
  return String(value || "").trim().toUpperCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseProfileLine(text, labels = []) {
  const source = String(text || "");

  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(
      `^\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`,
      "im"
    );
    const match = source.match(pattern);

    if (match?.[1]) {
      return match[1]
        .replace(/^\*+|\*+$/g, "")
        .trim();
    }
  }

  return "";
}

function parseKeywords(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}

function formatCreatorLabel(user) {
  const displayCode = String(user?.display_code || "").trim();
  const roleLabel = String(user?.role_label || "").trim();

  if (displayCode && roleLabel) return `${displayCode} · ${roleLabel}`;
  if (displayCode) return displayCode;
  if (roleLabel) return roleLabel;

  return "Profilansvarlig";
}

function cleanProfileText(profileText, creatorLabel) {
  let text = String(profileText || "").trim();

  text = text
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line
        .replace(/\*/g, "")
        .trim()
        .toLowerCase();

      return !(
        normalized.startsWith("oprettet af / signatur:") ||
        normalized.startsWith("created by / signature:") ||
        normalized.startsWith("lærerkode / signatur:") ||
        normalized.startsWith("laererkode / signatur:")
      );
    })
    .join("\n");

  const creatorLine = `**Oprettet af:** ${creatorLabel}`;

  if (!creatorLabel) {
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  const classLinePattern = new RegExp(
    `(^\\s*(?:\\*\\*)?(?:${escapeRegExp("Klasse / gruppe")}|${escapeRegExp("Class / group")}|${escapeRegExp("Klasse / gruppe / kontekst")}|${escapeRegExp("Klassetrin / kontekst")})(?:\\*\\*)?\\s*:\\s*.+?$)`,
    "im"
  );

  if (classLinePattern.test(text)) {
    text = text.replace(classLinePattern, `$1\n\n${creatorLine}`);
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  const lines = text.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) =>
    line.replace(/[#*_]/g, "").trim().toLowerCase() === "elevprofil v1"
  );

  if (titleIndex >= 0) {
    lines.splice(titleIndex + 1, 0, "", creatorLine);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return `${creatorLine}\n\n${text}`.replace(/\n{3,}/g, "\n\n").trim();
}

function parseStudentProfileText(profileText, creatorLabel = "") {
  const text = cleanProfileText(profileText, creatorLabel);

  if (!text) {
    return null;
  }

  const studentName = parseProfileLine(text, [
    "Elev / arbejdsnavn",
    "Student / working name",
    "Navn / arbejdsnavn",
  ]);

  const classGroup = parseProfileLine(text, [
    "Klasse / gruppe",
    "Class / group",
    "Klasse / gruppe / kontekst",
    "Klassetrin / kontekst",
  ]);

  const profileData = {
    primaere_observationer: parseProfileLine(text, [
      "Primære observationer",
      "Primaere observationer",
      "Primary observations",
    ]),
    laering_og_opgaver: parseProfileLine(text, [
      "Læring og opgaver",
      "Laering og opgaver",
      "Learning and tasks",
    ]),
    koncentration_udholdenhed: parseProfileLine(text, [
      "Koncentration / udholdenhed",
      "Concentration / stamina",
    ]),
    socialt_samspil: parseProfileLine(text, [
      "Socialt samspil",
      "Social interaction",
    ]),
    gruppearbejde: parseProfileLine(text, [
      "Gruppearbejde",
      "Group work",
    ]),
    skift_overgange: parseProfileLine(text, [
      "Skift / overgange",
      "Transitions",
    ]),
    belastninger_triggere: parseProfileLine(text, [
      "Belastninger og triggere",
      "Load / triggers",
    ]),
    det_der_virker: parseProfileLine(text, [
      "Det der virker",
      "What works",
    ]),
    det_der_boer_observeres: parseProfileLine(text, [
      "Det der bør observeres",
      "Det der boer observeres",
      "Should be observed",
    ]),
    keywords: parseKeywords(
      parseProfileLine(text, ["Keywords", "Nøgleord", "Noegleord"])
    ),
  };

  return {
    studentName,
    classGroup,
    profileData,
    readableProfile: text,
  };
}

async function getAccessUser(supabase, accessCode) {
  const { data, error } = await supabase
    .from("access_users")
    .select("access_code, display_code, full_name, role_label, organization_ref, is_active")
    .eq("access_code", accessCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Kunne ikke hente bruger fra access_users:", error);
    throw new Error("Brugeroplysninger kunne ikke hentes");
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Kun POST er understøttet",
    });
  }

  try {
    const accessCode = normalizeAccessCode(
      req.body?.adgangskode || req.body?.access_code
    );
    const profileText = String(req.body?.profile_text || "").trim();

    if (!accessCode) {
      return res.status(400).json({
        success: false,
        error: "Adgangskode mangler",
      });
    }

    if (!profileText) {
      return res.status(400).json({
        success: false,
        error: "Profiltekst mangler",
      });
    }

    const supabase = getSupabase();
    const accessUser = await getAccessUser(supabase, accessCode);

    if (!accessUser?.display_code) {
      return res.status(400).json({
        success: false,
        error: "Brugeren mangler i access_users eller mangler initialer/display_code",
      });
    }

    const creatorLabel = formatCreatorLabel(accessUser);
    const parsed = parseStudentProfileText(profileText, creatorLabel);

    if (!parsed) {
      return res.status(400).json({
        success: false,
        error: "Profiltekst mangler",
      });
    }

    if (!parsed.studentName || !parsed.classGroup) {
      return res.status(400).json({
        success: false,
        error: "Profilen mangler elevnavn eller klasse/gruppe",
      });
    }

    const { data, error } = await supabase
      .from("student_profiles")
      .insert({
        access_code: accessCode,
        student_name: parsed.studentName,
        class_group: parsed.classGroup,
        created_by_signature: accessUser.display_code,
        profile_owner_signature: accessUser.display_code,
        profile_data: parsed.profileData,
        readable_profile: parsed.readableProfile,
        status: "active",
      })
      .select("id, student_name, class_group, created_by_signature")
      .single();

    if (error) {
      console.error("Kunne ikke gemme elevprofil:", error);
      return res.status(500).json({
        success: false,
        error: "Profilen kunne ikke gemmes",
      });
    }

    return res.status(200).json({
      success: true,
      id: data.id,
      student_name: data.student_name,
      class_group: data.class_group,
      created_by_display_code: data.created_by_signature,
      created_by_label: creatorLabel,
    });
  } catch (error) {
    console.error("Fejl ved gem elevprofil:", error);

    return res.status(500).json({
      success: false,
      error: "Profilen kunne ikke gemmes",
      details: error.message,
    });
  }
}
