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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe");
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
  const match = source.match(
    /tilføj observation\s*\/\s*forslag til elevprofil\s+for\s+(.+?)\s*:?\s*$/im
  );

  return match?.[1]?.trim() || "";
}

function extractBlock(text, startLabels = [], stopLabels = []) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");

  const startPatterns = startLabels.map(
    (label) =>
      new RegExp(
        `^\\s*(?:[-•]\\s*)?(?:\\*\\*)?${escapeRegExp(
          label
        )}(?:\\*\\*)?\\s*:\\s*(.*)$`,
        "i"
      )
  );

  const stopPatterns = stopLabels.map(
    (label) =>
      new RegExp(
        `^\\s*(?:[-•]\\s*)?(?:\\*\\*)?${escapeRegExp(
          label
        )}(?:\\*\\*)?\\s*:`,
        "i"
      )
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

  if (firstLine) {
    parts.push(firstLine);
  }

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
  const text = normalizeText(value);

  if (
    text.includes("gentaget") ||
    text.includes("flere gange") ||
    text.includes("set flere")
  ) {
    return "gentaget_observation";
  }

  if (text.includes("moenster")) {
    return "muligt_moenster";
  }

  if (text.includes("enkel")) {
    return "enkelthaendelse";
  }

  return "usikkert";
}

function normalizeReviewDecision(value) {
  const text = normalizeText(value).replace(/\s+/g, "_");

  const exactStatuses = new Set([
    "afventer_vurdering",
    "valgt_til_profil",
    "daekket_af_profil",
    "afvist_ikke_aktuelt",
    "afventer_flere_observationer",
    "droeftes_i_team",
    "indarbejdet_i_profil",
  ]);

  if (exactStatuses.has(text)) {
    return text;
  }

  if (
    text.includes("integrer") ||
    text.includes("brug_i_profil") ||
    text.includes("skal_indarbejdes") ||
    text === "brug"
  ) {
    return "valgt_til_profil";
  }

  if (
    text.includes("allerede_daekket") ||
    text.includes("daekket") ||
    text.includes("eksisterende_profil")
  ) {
    return "daekket_af_profil";
  }

  if (
    text.includes("afvis") ||
    text.includes("ikke_relevant") ||
    text.includes("ikke_aktuelt")
  ) {
    return "afvist_ikke_aktuelt";
  }

  if (
    text.includes("afvent") ||
    text.includes("flere_observationer")
  ) {
    return "afventer_flere_observationer";
  }

  if (
    text.includes("team") ||
    text.includes("droeft")
  ) {
    return "droeftes_i_team";
  }

  if (text.includes("indarbejdet")) {
    return "indarbejdet_i_profil";
  }

  return null;
}

function parseObservationDate(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const danish = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (danish) {
    const [, day, month, year] = danish;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;
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
    "Status",
  ];

  const studentName =
    parseLine(text, [
      "Elev / arbejdsnavn",
      "Navn / arbejdsnavn",
      "Elev",
    ]) || parseTitleStudentName(text);

  const classGroup = parseLine(text, [
    "Klasse / gruppe",
    "Class / group",
  ]);

  const observationDate = parseObservationDate(
    parseLine(text, ["Dato", "Date"])
  );

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
    parseLine(text, [
      "Er dette en enkelthændelse eller noget du har set flere gange?",
    ]);

  const suggestedProfileChange = extractBlock(
    text,
    ["Forslag til profilændring", "Forslag til profilaendring"],
    stopLabels
  );

  return {
    studentName,
    classGroup,
    observationDate,
    situation,
    observationText: observation,
    testedAction,
    studentReaction,
    effect,
    observationType: normalizeObservationType(
      observationTypeRaw || observation
    ),
    suggestedProfileChange,
  };
}

async function getAccessUser(supabase, accessCode) {
  const { data, error } = await supabase
    .from("access_users")
    .select(
      "access_code, display_code, full_name, role_label, organization_ref, is_active"
    )
    .eq("access_code", accessCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Kunne ikke hente bruger fra access_users:", error);
    throw new Error("Brugeroplysninger kunne ikke hentes");
  }

  return data;
}

async function getProfileById(supabase, profileId) {
  const { data, error } = await supabase
    .from("student_profiles")
    .select(
      "id, access_code, student_name, class_group, profile_owner_signature, status, created_at"
    )
    .eq("id", profileId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("Kunne ikke hente elevprofil via profile_id:", error);
    throw new Error("Elevprofilen kunne ikke hentes");
  }

  return data || null;
}

async function getOrganizationByAccessCode(supabase, accessCode) {
  const normalizedCode = normalizeAccessCode(accessCode);

  if (!normalizedCode) return "";

  const { data, error } = await supabase
    .from("access_users")
    .select("organization_ref")
    .eq("access_code", normalizedCode)
    .maybeSingle();

  if (error) {
    console.error("Kunne ikke hente organisation:", error);
    throw new Error("Organisationen kunne ikke kontrolleres");
  }

  return String(data?.organization_ref || "").trim();
}

async function getProfileOrganization(supabase, profile) {
  return getOrganizationByAccessCode(
    supabase,
    profile?.access_code
  );
}

async function canAccessProfile(supabase, accessUser, profile) {
  if (!accessUser || !profile) return false;

  if (
    normalizeAccessCode(accessUser.access_code) ===
    normalizeAccessCode(profile.access_code)
  ) {
    return true;
  }

  const userOrganization = String(
    accessUser.organization_ref || ""
  ).trim();

  if (!userOrganization) return false;

  const profileOrganization = await getProfileOrganization(
    supabase,
    profile
  );

  return (
    profileOrganization &&
    normalizeText(profileOrganization) === normalizeText(userOrganization)
  );
}

async function findStudentProfile(supabase, accessCode, parsed) {
  if (!parsed?.studentName) return null;

  let query = supabase
    .from("student_profiles")
    .select(
      "id, access_code, student_name, class_group, profile_owner_signature, status, created_at"
    )
    .eq("access_code", accessCode)
    .ilike("student_name", parsed.studentName)
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

function isProfileOwner(accessUser, profile) {
  const currentSignature = normalizeText(accessUser?.display_code);
  const ownerSignature = normalizeText(
    profile?.profile_owner_signature
  );

  if (ownerSignature && currentSignature === ownerSignature) {
    return true;
  }

  return (
    normalizeAccessCode(accessUser?.access_code) ===
    normalizeAccessCode(profile?.access_code)
  );
}

async function handlePost(req, res) {
  const accessCode = normalizeAccessCode(
    req.body?.adgangskode || req.body?.access_code
  );

  const profileId = String(req.body?.profile_id || "").trim();
  const observationText = String(
    req.body?.observation_text || ""
  ).trim();

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
      error:
        "Brugeren mangler i access_users eller mangler initialer/display_code",
    });
  }

  const parsed = parseObservationText(observationText);

  if (!parsed?.observationText) {
    return res.status(400).json({
      success: false,
      error: "Observationen mangler kort observation",
    });
  }

  let profile = null;

  if (profileId) {
    profile = await getProfileById(supabase, profileId);

    if (!profile?.id) {
      return res.status(404).json({
        success: false,
        error: "Den valgte elevprofil blev ikke fundet",
      });
    }

    const hasAccess = await canAccessProfile(
      supabase,
      accessUser,
      profile
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Du har ikke adgang til denne elevprofil",
      });
    }
  } else {
    if (!parsed?.studentName) {
      return res.status(400).json({
        success: false,
        error: "Observationen mangler elevnavn",
      });
    }

    profile = await findStudentProfile(
      supabase,
      accessCode,
      parsed
    );
  }

  const studentName =
    profile?.student_name || parsed.studentName || "";

  const classGroup =
    profile?.class_group || parsed.classGroup || "";

  if (!studentName) {
    return res.status(400).json({
      success: false,
      error: "Observationen mangler elevnavn",
    });
  }

  if (!classGroup) {
    return res.status(400).json({
      success: false,
      error:
        "Observationen mangler klasse/gruppe, og der blev ikke fundet en aktiv elevprofil at koble den til",
    });
  }

  const { data, error } = await supabase
    .from("student_observations")
    .insert({
      profile_id: profile?.id || null,
      access_code: accessCode,
      student_name: studentName,
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
      suggested_profile_change:
        parsed.suggestedProfileChange || null,
      review_status: "afventer_vurdering",
      reviewed_by_signature: null,
      reviewed_at: null,
      review_note: null,
    })
    .select(
      "id, profile_id, student_name, class_group, written_by_signature, role_function, review_status"
    )
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
    profile_id: data.profile_id,
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

  const profileId = String(req.query?.profile_id || "").trim();
  const studentName = String(
    req.query?.student_name || req.query?.student || ""
  ).trim();

  const classGroup = String(
    req.query?.class_group || ""
  ).trim();

  const reviewStatus = normalizeReviewDecision(
    req.query?.review_status
  );

  if (!accessCode) {
    return res.status(400).json({
      success: false,
      error: "Adgangskode mangler",
    });
  }

  if (!profileId && !studentName) {
    return res.status(400).json({
      success: false,
      error: "profile_id eller elevnavn mangler",
    });
  }

  const supabase = getSupabase();
  const accessUser = await getAccessUser(supabase, accessCode);

  if (!accessUser?.display_code) {
    return res.status(400).json({
      success: false,
      error:
        "Brugeren mangler i access_users eller mangler initialer/display_code",
    });
  }

  let profile = null;
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
      created_at,
      updated_at
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (profileId) {
    profile = await getProfileById(supabase, profileId);

    if (!profile?.id) {
      return res.status(404).json({
        success: false,
        error: "Den valgte elevprofil blev ikke fundet",
      });
    }

    const hasAccess = await canAccessProfile(
      supabase,
      accessUser,
      profile
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Du har ikke adgang til denne elevprofil",
      });
    }

    query = query.eq("profile_id", profileId);
  } else {
    query = query
      .eq("access_code", accessCode)
      .ilike("student_name", studentName)
      .limit(20);

    if (classGroup) {
      query = query.eq("class_group", classGroup);
    }
  }

  if (req.query?.review_status && !reviewStatus) {
    return res.status(400).json({
      success: false,
      error: "Ukendt observationsstatus",
    });
  }

  if (reviewStatus) {
    query = query.eq("review_status", reviewStatus);
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
    profile_id: profile?.id || null,
    student_name:
      profile?.student_name || studentName || data?.[0]?.student_name || null,
    class_group:
      profile?.class_group ||
      classGroup ||
      data?.[0]?.class_group ||
      null,
    count: Array.isArray(data) ? data.length : 0,
    observations: Array.isArray(data) ? data : [],
  });
}

async function linkObservationToProfile({
  supabase,
  accessUser,
  observationId,
  profileId,
}) {
  if (!profileId) {
    return {
      status: 400,
      body: {
        success: false,
        error: "profile_id mangler",
      },
    };
  }

  const { data: observation, error: observationError } =
    await supabase
      .from("student_observations")
      .select(`
        id,
        profile_id,
        access_code,
        student_name,
        class_group,
        review_status
      `)
      .eq("id", observationId)
      .maybeSingle();

  if (observationError) {
    console.error("Kunne ikke hente observation:", observationError);

    return {
      status: 500,
      body: {
        success: false,
        error: "Observationen kunne ikke hentes",
      },
    };
  }

  if (!observation?.id) {
    return {
      status: 404,
      body: {
        success: false,
        error: "Observationen blev ikke fundet",
      },
    };
  }

  if (observation.profile_id) {
    if (observation.profile_id === profileId) {
      return {
        status: 200,
        body: {
          success: true,
          already_linked: true,
          observation,
        },
      };
    }

    return {
      status: 409,
      body: {
        success: false,
        error:
          "Observationen er allerede koblet til en anden elevprofil.",
      },
    };
  }

  const profile = await getProfileById(supabase, profileId);

  if (!profile?.id) {
    return {
      status: 404,
      body: {
        success: false,
        error: "Den valgte elevprofil blev ikke fundet",
      },
    };
  }

  const hasAccess = await canAccessProfile(
    supabase,
    accessUser,
    profile
  );

  if (!hasAccess) {
    return {
      status: 403,
      body: {
        success: false,
        error: "Du har ikke adgang til den valgte elevprofil",
      },
    };
  }

  if (!isProfileOwner(accessUser, profile)) {
    return {
      status: 403,
      body: {
        success: false,
        error:
          "Kun profilansvarlig kan koble observationen til profilen.",
      },
    };
  }

  const observationCode = normalizeAccessCode(
    observation.access_code
  );

  const currentCode = normalizeAccessCode(
    accessUser.access_code
  );

  const profileCode = normalizeAccessCode(
    profile.access_code
  );

  const directCodeMatch =
    observationCode === currentCode ||
    observationCode === profileCode;

  const observationOrganization =
    await getOrganizationByAccessCode(
      supabase,
      observation.access_code
    );

  const profileOrganization =
    await getProfileOrganization(supabase, profile);

  const organizationMatch =
    observationOrganization &&
    profileOrganization &&
    normalizeText(observationOrganization) ===
      normalizeText(profileOrganization);

  if (!directCodeMatch && !organizationMatch) {
    return {
      status: 403,
      body: {
        success: false,
        error:
          "Observationen og profilen tilhører ikke samme bruger eller organisation.",
      },
    };
  }

  const updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("student_observations")
    .update({
      profile_id: profile.id,
      student_name: profile.student_name,
      class_group: profile.class_group,
      updated_at: updatedAt,
    })
    .eq("id", observationId)
    .is("profile_id", null)
    .select(`
      id,
      profile_id,
      student_name,
      class_group,
      review_status,
      updated_at
    `)
    .single();

  if (error) {
    console.error(
      "Kunne ikke koble observation til profil:",
      error
    );

    return {
      status: 500,
      body: {
        success: false,
        error:
          "Observationen kunne ikke kobles til elevprofilen",
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      linked: true,
      observation: data,
    },
  };
}

async function handlePatch(req, res) {
  const accessCode = normalizeAccessCode(
    req.body?.adgangskode || req.body?.access_code
  );

  const observationId = String(
    req.body?.observation_id || req.body?.id || ""
  ).trim();

  const profileId = String(
    req.body?.profile_id || ""
  ).trim();

  const rawAction = String(
    req.body?.handling || req.body?.action || ""
  ).trim();

  const normalizedAction = normalizeText(rawAction)
    .replace(/\s+/g, "_");

  const wantsProfileLink = [
    "kobl_til_profil",
    "kobl_profil",
    "link_profile",
    "link_to_profile",
  ].includes(normalizedAction);

  const reviewStatus = normalizeReviewDecision(
    req.body?.review_status || rawAction
  );

  const reviewNote = String(
    req.body?.review_note || ""
  ).trim();

  if (!accessCode) {
    return res.status(400).json({
      success: false,
      error: "Adgangskode mangler",
    });
  }

  if (!observationId) {
    return res.status(400).json({
      success: false,
      error: "observation_id mangler",
    });
  }

  const supabase = getSupabase();
  const accessUser = await getAccessUser(
    supabase,
    accessCode
  );

  if (!accessUser?.display_code) {
    return res.status(400).json({
      success: false,
      error:
        "Brugeren mangler i access_users eller mangler initialer/display_code",
    });
  }

  if (wantsProfileLink) {
    const result = await linkObservationToProfile({
      supabase,
      accessUser,
      observationId,
      profileId,
    });

    return res.status(result.status).json(result.body);
  }

  if (!reviewStatus) {
    return res.status(400).json({
      success: false,
      error:
        "Ukendt handling. Brug Integrér, Dækket, Afvis, Afvent eller Drøft.",
    });
  }

  if (reviewStatus === "indarbejdet_i_profil") {
    return res.status(400).json({
      success: false,
      error:
        "Status indarbejdet_i_profil sættes først, når en ny profilversion er godkendt.",
    });
  }

  const { data: observation, error: observationError } =
    await supabase
      .from("student_observations")
      .select("id, profile_id, review_status")
      .eq("id", observationId)
      .maybeSingle();

  if (observationError) {
    console.error(
      "Kunne ikke hente observation:",
      observationError
    );

    return res.status(500).json({
      success: false,
      error: "Observationen kunne ikke hentes",
    });
  }

  if (!observation?.id) {
    return res.status(404).json({
      success: false,
      error: "Observationen blev ikke fundet",
    });
  }

  if (!observation.profile_id) {
    return res.status(400).json({
      success: false,
      error:
        "Observationen er ikke koblet til en elevprofil og kan derfor ikke vurderes endnu.",
    });
  }

  const profile = await getProfileById(
    supabase,
    observation.profile_id
  );

  if (!profile?.id) {
    return res.status(404).json({
      success: false,
      error:
        "Observationens aktive elevprofil blev ikke fundet",
    });
  }

  if (!isProfileOwner(accessUser, profile)) {
    return res.status(403).json({
      success: false,
      error:
        "Kun profilansvarlig kan vurdere denne observation.",
    });
  }

  const reviewedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("student_observations")
    .update({
      review_status: reviewStatus,
      reviewed_by_signature:
        accessUser.display_code,
      reviewed_at: reviewedAt,
      review_note: reviewNote || null,
      updated_at: reviewedAt,
    })
    .eq("id", observationId)
    .eq("profile_id", profile.id)
    .select(`
      id,
      profile_id,
      review_status,
      reviewed_by_signature,
      reviewed_at,
      review_note,
      updated_at
    `)
    .single();

  if (error) {
    console.error(
      "Kunne ikke opdatere observation:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Observationens status kunne ikke opdateres",
    });
  }

  return res.status(200).json({
    success: true,
    observation: data,
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

    if (req.method === "PATCH") {
      return await handlePatch(req, res);
    }

    return res.status(405).json({
      success: false,
      error: "Kun GET, POST og PATCH er understøttet",
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
