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

function parseLine(text, labels = []) {
  const source = String(text || "");

  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(
      `^\\s*(?:[-•]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.*?)\\s*$`,
      "im"
    );
    const match = source.match(pattern);

    if (match && match[1] !== undefined) {
      return String(match[1])
        .replace(/^\*+|\*+$/g, "")
        .trim();
    }
  }

  return "";
}

function parseTitleStudentName(text) {
  const source = String(text || "");
  const match = source.match(/tilføj observation\s*\/\s*forslag til elevprofil\s+for\s+(.+?)\s*:?\s*$/im);
  return match?.[1]?.trim() || "";
}

function extractBlock(text, startLabels = [], stopLabels = []) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");

  const startPatterns = startLabels.map((label) =>
    new RegExp(`^\\s*(?:[-•]\\s*)?(?:\\*\\*)?${escapeRegExp(label)}(?:\\*\\*)?\\s*:\\s*(.*)$`, "i")
  );

  const stopPatterns = stopLabels.map((label) =>
    new RegExp(`^\\s*(?:[-•]\\s*)?(?:\\*\\*)?${escapeRegExp(label)}(?:\\*\\*)?\\s*:`, "i")
  );

  let startIndex = -1;
  let firstLine = "";

  for (let i = 0; i < lines.length; i += 1) {
    for (const pattern of startPatterns) {
      const match = lines[i].match(pattern);
      if (match) {
        startIndex = i;
        firstLine = String(match[1] || "").trim();
        break;
      }
    }

    if (startIndex >= 0) break;
  }

  if (startIndex < 0) return "";

  const parts = [];
  if (firstLine) parts.push(firstLine);

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (stopPatterns.some((pattern) => pattern.test(line))) {
      break;
    }

    parts.push(line);
  }

  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeObservationType(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("gentaget") || text.includes("flere gange") || text.includes("set flere")) {
    return "gentaget_observation";
  }

  if (text.includes("mønster") || text.includes("moenster")) {
    return "muligt_moenster";
  }

  if (text.includes("enkel")) {
    return "enkelthaendelse";
  }

  return "usikkert";
}

function normalizeReviewStatus(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("indarbejdet")) return "indarbejdet_i_profil";
  if (text.includes("afvist")) return "afvist_ikke_aktuelt";
  if (text.includes("team") || text.includes("drøft") || text.includes("droeft")) return "droeftes_i_team";
  if (text.includes("flere")) return "afventer_flere_observationer";

  return "afventer_vurdering";
}

function parseObservationDate(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const danish = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (danish) {
    const [, day, month, year] = danish;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;

  return null;
}

function parseObservationText(observationText) {
  const text = String(observationText || "").trim();

  if (!text) return null;

  const stopLabels = [
    "Elev / arbejdsnavn",
    "Klasse / gruppe",
    "Dato",
    "Skrevet af",
    "Rolle",
    "Situation",
    "Kort observation",
    "Observation",
    "Hvad blev afprøvet",
    "Hvad blev afproevet",
    "Barnets/elevens reaktion",
    "Effekt",
    "Er dette en enkelthændelse eller noget du har set flere gange?",
    "Observationstype",
    "Forslag til profilændring",
    "Forslag til profilaendring",
    "Skal klasselærer/profilansvarlig vurdere dette? Ja/nej/usikkert",
    "Skal klasselærer/profilansvarlig vurdere dette?",
    "Vurdering ønskes",
    "Status"
  ];

  const studentName =
    parseLine(text, ["Elev / arbejdsnavn", "Navn / arbejdsnavn", "Elev"]) ||
    parseTitleStudentName(text);

  const classGroup = parseLine(text, ["Klasse / gruppe", "Class / group"]);
  const observationDate = parseObservationDate(parseLine(text, ["Dato", "Date"]));
  const situation = extractBlock(text, ["Situation"], stopLabels);
  const observation =
    extractBlock(text, ["Kort observation"], stopLabels) ||
    extractBlock(text, ["Observation"], stopLabels);

  const testedAction = extractBlock(
    text,
    ["Hvad blev afprøvet", "Hvad blev afproevet"],
    stopLabels
  );

  const studentReaction = extractBlock(
    text,
    ["Barnets/elevens reaktion", "Elevens reaktion"],
    stopLabels
  );

  const effect = extractBlock(text, ["Effekt"], stopLabels);

  const observationTypeRaw =
    extractBlock(text, ["Observationstype"], stopLabels) ||
    parseLine(text, ["Er dette en enkelthændelse eller noget du har set flere gange?"]);

  const suggestedProfileChange = extractBlock(
    text,
    ["Forslag til profilændring", "Forslag til profilaendring"],
    stopLabels
  );

  const reviewWish = parseLine(text, [
    "Skal klasselærer/profilansvarlig vurdere dette? Ja/nej/usikkert",
    "Skal klasselærer/profilansvarlig vurdere dette?",
    "Vurdering ønskes"
  ]);

  const status = parseLine(text, ["Status"]);

  return {
    studentName,
    classGroup,
    observationDate,
    situation,
    observationText: observation,
    testedAction,
    studentReaction,
    effect,
    observationType: normalizeObservationType(observationTypeRaw || observation),
    suggestedProfileChange,
    reviewStatus: normalizeReviewStatus(status || reviewWish),
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

async function findStudentProfile(supabase, accessCode, parsed) {
  if (!parsed?.studentName) return null;

  let query = supabase
    .from("student_profiles")
    .select("id, student_name, class_group, status, created_at")
    .eq("access_code", accessCode)
    .eq("student_name", parsed.studentName)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (parsed.classGroup) {
    query = query.eq("class_group", parsed.classGroup);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Kunne ikke finde elevprofil:", error);
    return null;
  }

  return data || null;
}

async function handlePost(req, res) {
  const accessCode = normalizeAccessCode(
    req.body?.adgangskode || req.body?.access_code
  );
  const observationText = String(req.body?.observation_text || "").trim();

  if (!accessCode) {
    return res.status(400).json({
      success: false,
      error: "Adgangskode mangler",
    });
  }

  if (!observationText) {
    return res.status(400).json({
      success: false,
      error: "Observationstekst mangler",
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

  const parsed = parseObservationText(observationText);

  if (!parsed?.studentName) {
    return res.status(400).json({
      success: false,
      error: "Observationen mangler elevnavn",
    });
  }

  if (!parsed.observationText) {
    return res.status(400).json({
      success: false,
      error: "Observationen mangler kort observation",
    });
  }

  const profile = await findStudentProfile(supabase, accessCode, parsed);
  const classGroup = parsed.classGroup || profile?.class_group || "";

  if (!classGroup) {
    return res.status(400).json({
      success: false,
      error: "Observationen mangler klasse/gruppe, og der blev ikke fundet en aktiv elevprofil at koble den til",
    });
  }

  const { data, error } = await supabase
    .from("student_observations")
    .insert({
      profile_id: profile?.id || null,
      access_code: accessCode,
      student_name: parsed.studentName,
      class_group: classGroup,
      written_by_signature: accessUser.display_code,
      role_function: accessUser.role_label || null,
      observation_date: parsed.observationDate,
      situation: parsed.situation || null,
      observation_text: parsed.observationText,
      tested_action: parsed.testedAction || null,
      student_reaction: parsed.studentReaction || null,
      effect: parsed.effect || null,
      observation_type: parsed.observationType,
      suggested_profile_change: parsed.suggestedProfileChange || null,
      review_status: parsed.reviewStatus,
    })
    .select("id, student_name, class_group, written_by_signature, role_function, review_status")
    .single();

  if (error) {
    console.error("Kunne ikke gemme observation:", error);
    return res.status(500).json({
      success: false,
      error: "Observationen kunne ikke gemmes",
    });
  }

  return res.status(200).json({
    success: true,
    id: data.id,
    student_name: data.student_name,
    class_group: data.class_group,
    written_by_display_code: data.written_by_signature,
    role_function: data.role_function,
    review_status: data.review_status,
  });
}

async function handleGet(req, res) {
  const accessCode = normalizeAccessCode(
    req.query?.adgangskode || req.query?.access_code
  );
  const studentName = String(req.query?.student_name || req.query?.student || "").trim();
  const classGroup = String(req.query?.class_group || "").trim();

  if (!accessCode) {
    return res.status(400).json({
      success: false,
      error: "Adgangskode mangler",
    });
  }

  if (!studentName) {
    return res.status(400).json({
      success: false,
      error: "Elevnavn mangler",
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

  let query = supabase
    .from("student_observations")
    .select(`
      id,
      profile_id,
      student_name,
      class_group,
      written_by_signature,
      role_function,
      observation_date,
      situation,
      observation_text,
      tested_action,
      student_reaction,
      effect,
      observation_type,
      suggested_profile_change,
      review_status,
      reviewed_by_signature,
      reviewed_at,
      review_note,
      created_at
    `)
    .eq("access_code", accessCode)
    .eq("student_name", studentName)
    .order("created_at", { ascending: false })
    .limit(20);

  if (classGroup) {
    query = query.eq("class_group", classGroup);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Kunne ikke hente observationer:", error);
    return res.status(500).json({
      success: false,
      error: "Observationer kunne ikke hentes",
    });
  }

  return res.status(200).json({
    success: true,
    student_name: studentName,
    class_group: classGroup || data?.[0]?.class_group || null,
    count: Array.isArray(data) ? data.length : 0,
    observations: Array.isArray(data) ? data : [],
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      return await handlePost(req, res);
    }

    if (req.method === "GET") {
      return await handleGet(req, res);
    }

    return res.status(405).json({
      success: false,
      error: "Kun GET og POST er understøttet",
    });
  } catch (error) {
    console.error("Fejl ved student-observations:", error);

    return res.status(500).json({
      success: false,
      error: "Observationen kunne ikke behandles",
      details: error.message,
    });
  }
}
