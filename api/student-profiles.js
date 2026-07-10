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

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeComparableText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeObservationIds(value) {
  const items = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];

  return [...new Set(items.map(normalizeId).filter(Boolean))];
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseProfileLine(text, labels = []) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");

  const allLabels = [
    "Elev / arbejdsnavn",
    "Student / working name",
    "Navn / arbejdsnavn",
    "Klasse / gruppe",
    "Class / group",
    "Klasse / gruppe / kontekst",
    "Klassetrin / kontekst",
    "Primære observationer",
    "Primaere observationer",
    "Primary observations",
    "Læring og opgaver",
    "Laering og opgaver",
    "Learning and tasks",
    "Koncentration / udholdenhed",
    "Concentration / stamina",
    "Socialt samspil",
    "Social interaction",
    "Gruppearbejde",
    "Group work",
    "Skift / overgange",
    "Transitions",
    "Belastninger og triggere",
    "Load / triggers",
    "Det der virker",
    "What works",
    "Det der bør observeres",
    "Det der boer observeres",
    "Should be observed",
    "Keywords",
    "Nøgleord",
    "Noegleord",
    "Oprettet af",
    "Created by",
    "Oprettet af / signatur",
    "Created by / signature",
    "Lærerkode / signatur",
    "Laererkode / signatur",
  ];

  const requestedPatterns = labels.map((label) =>
    new RegExp(`^\\s*(?:\\*\\*)?${escapeRegExp(label)}(?:\\*\\*)?\\s*:\\s*(.*)$`, "i")
  );

  const stopPatterns = allLabels.map((label) =>
    new RegExp(`^\\s*(?:\\*\\*)?${escapeRegExp(label)}(?:\\*\\*)?\\s*:`, "i")
  );

  for (let i = 0; i < lines.length; i += 1) {
    for (const pattern of requestedPatterns) {
      const match = lines[i].match(pattern);

      if (!match) {
        continue;
      }

      const parts = [];
      const firstValue = String(match[1] || "").trim();

      if (firstValue) {
        parts.push(firstValue);
      }

      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = lines[j];

        if (stopPatterns.some((stopPattern) => stopPattern.test(nextLine))) {
          break;
        }

        const cleanedLine = nextLine.trim();

        if (cleanedLine) {
          parts.push(cleanedLine);
        }
      }

      return parts
        .join(" ")
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

      const isInternalChangeMarker =
        normalized.startsWith("[") &&
        normalized.endsWith("]") &&
        (
          normalized.includes("uændret") ||
          normalized.includes("uaendret") ||
          normalized.includes("nyt") ||
          normalized.includes("ændret") ||
          normalized.includes("aendret") ||
          normalized.includes("fortsat usikkert")
        );

      return !(
        isInternalChangeMarker ||
        normalized.startsWith("oprettet af / signatur:") ||
        normalized.startsWith("created by / signature:") ||
        normalized.startsWith("lærerkode / signatur:") ||
        normalized.startsWith("laererkode / signatur:") ||
        normalized.startsWith("oprettet af:")
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

async function createProfile(req, res) {
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
}

async function updateProfile(req, res) {
  const accessCode = normalizeAccessCode(
    req.body?.adgangskode || req.body?.access_code
  );
  const profileText = String(req.body?.profile_text || "").trim();
  const requestedProfileId = normalizeId(req.body?.profile_id);
  const hasObservationIds = Object.prototype.hasOwnProperty.call(
    req.body || {},
    "observation_ids"
  );
  const requestedObservationIds = normalizeObservationIds(
    req.body?.observation_ids
  );

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

  if (requestedProfileId && !isUuid(requestedProfileId)) {
    return res.status(400).json({
      success: false,
      error: "Profil-id er ugyldigt",
    });
  }

  const invalidObservationId = requestedObservationIds.find(
    (observationId) => !isUuid(observationId)
  );

  if (invalidObservationId) {
    return res.status(400).json({
      success: false,
      error: "Mindst ét observations-id er ugyldigt",
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

  if (!parsed?.studentName || !parsed?.classGroup) {
    return res.status(400).json({
      success: false,
      error: "Profilen mangler elevnavn eller klasse/gruppe",
    });
  }

  let existingProfile = null;

  if (requestedProfileId) {
    const { data: exactProfile, error: exactProfileError } = await supabase
      .from("student_profiles")
      .select(
        "id, student_name, class_group, created_by_signature, profile_owner_signature, profile_data, readable_profile, status, updated_at, created_at"
      )
      .eq("id", requestedProfileId)
      .eq("access_code", accessCode)
      .eq("status", "active")
      .maybeSingle();

    if (exactProfileError) {
      console.error("Kunne ikke hente den valgte elevprofil:", exactProfileError);
      return res.status(500).json({
        success: false,
        error: "Den valgte elevprofil kunne ikke hentes",
      });
    }

    if (!exactProfile?.id) {
      return res.status(404).json({
        success: false,
        error: "Den valgte aktive elevprofil blev ikke fundet",
      });
    }

    const sameStudent =
      normalizeComparableText(exactProfile.student_name) ===
      normalizeComparableText(parsed.studentName);
    const sameClass =
      normalizeComparableText(exactProfile.class_group) ===
      normalizeComparableText(parsed.classGroup);

    if (!sameStudent || !sameClass) {
      return res.status(409).json({
        success: false,
        error:
          "Profilteksten passer ikke til den valgte elevprofil. Opdateringen blev stoppet.",
      });
    }

    existingProfile = exactProfile;
  } else {
    const { data: activeProfiles, error: findError } = await supabase
      .from("student_profiles")
      .select(
        "id, student_name, class_group, created_by_signature, profile_owner_signature, profile_data, readable_profile, status, updated_at, created_at"
      )
      .eq("access_code", accessCode)
      .ilike("student_name", parsed.studentName)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (findError) {
      console.error("Kunne ikke finde aktiv elevprofil:", findError);
      return res.status(500).json({
        success: false,
        error: "Aktiv elevprofil kunne ikke findes",
      });
    }

    const profiles = Array.isArray(activeProfiles) ? activeProfiles : [];
    const normalizedParsedClass = normalizeComparableText(parsed.classGroup);

    const classMatch = profiles.find(
      (profile) =>
        normalizeComparableText(profile?.class_group) === normalizedParsedClass
    );

    existingProfile =
      classMatch ||
      (profiles.length === 1 ? profiles[0] : null);

    if (!existingProfile?.id) {
      return res.status(404).json({
        success: false,
        error:
          profiles.length > 1
            ? "Der blev fundet flere aktive elevprofiler med samme navn. Skriv klasse/gruppe præcist."
            : "Der blev ikke fundet en aktiv elevprofil med samme navn",
      });
    }
  }

  const profileOwner = String(
    existingProfile.profile_owner_signature ||
      existingProfile.created_by_signature ||
      ""
  ).trim();

  if (profileOwner && profileOwner !== accessUser.display_code) {
    return res.status(403).json({
      success: false,
      error: "Kun profilansvarlig kan godkende og gemme profilopdateringen",
    });
  }

  let selectedObservations = [];

  if (hasObservationIds) {
    if (requestedObservationIds.length > 0) {
      const { data: exactObservations, error: exactObservationError } =
        await supabase
          .from("student_observations")
          .select(
            "id, observation_text, observation_date, written_by_signature"
          )
          .eq("access_code", accessCode)
          .eq("profile_id", existingProfile.id)
          .eq("review_status", "valgt_til_profil")
          .in("id", requestedObservationIds)
          .order("created_at", { ascending: true });

      if (exactObservationError) {
        console.error(
          "Kunne ikke hente de valgte observationer:",
          exactObservationError
        );
        return res.status(500).json({
          success: false,
          error: "De valgte observationer kunne ikke hentes",
        });
      }

      selectedObservations = Array.isArray(exactObservations)
        ? exactObservations
        : [];

      const foundIds = new Set(
        selectedObservations.map((observation) => observation.id)
      );
      const missingIds = requestedObservationIds.filter(
        (observationId) => !foundIds.has(observationId)
      );

      if (missingIds.length > 0) {
        return res.status(409).json({
          success: false,
          error:
            "Mindst én valgt observation tilhører ikke profilen eller er ikke længere valgt til profilen. Opdateringen blev stoppet.",
        });
      }
    }
  } else {
    const { data: fallbackObservations, error: observationFindError } =
      await supabase
        .from("student_observations")
        .select("id, observation_text, observation_date, written_by_signature")
        .eq("access_code", accessCode)
        .eq("profile_id", existingProfile.id)
        .eq("review_status", "valgt_til_profil")
        .order("created_at", { ascending: true });

    if (observationFindError) {
      console.error(
        "Kunne ikke hente valgte observationer:",
        observationFindError
      );
      return res.status(500).json({
        success: false,
        error: "Valgte observationer kunne ikke hentes",
      });
    }

    selectedObservations = Array.isArray(fallbackObservations)
      ? fallbackObservations
      : [];
  }

  const observationsToIntegrate = selectedObservations;
  const updateTimestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from("student_profiles")
    .update({
      profile_data: parsed.profileData,
      readable_profile: parsed.readableProfile,
      updated_at: updateTimestamp,
    })
    .eq("id", existingProfile.id)
    .eq("access_code", accessCode)
    .eq("status", "active")
    .select("id, student_name, class_group, profile_owner_signature, updated_at")
    .single();

  if (error) {
    console.error("Kunne ikke opdatere elevprofil:", error);
    return res.status(500).json({
      success: false,
      error: "Profilen kunne ikke opdateres",
    });
  }

  const changeRows = [
    {
      profile_id: existingProfile.id,
      observation_id: null,
      changed_by_signature: accessUser.display_code,
      change_type: "profile_update",
      change_note: observationsToIntegrate.length
        ? `Godkendt profilopdatering med ${observationsToIntegrate.length} valgt${observationsToIntegrate.length === 1 ? "" : "e"} observation${observationsToIntegrate.length === 1 ? "" : "er"}`
        : "Godkendt profilopdatering",
      old_profile_data: existingProfile.profile_data || {},
      new_profile_data: parsed.profileData || {},
      old_readable_profile: existingProfile.readable_profile || "",
      new_readable_profile: parsed.readableProfile || "",
    },
    ...observationsToIntegrate.map((observation) => ({
      profile_id: existingProfile.id,
      observation_id: observation.id,
      changed_by_signature: accessUser.display_code,
      change_type: "observation_indarbejdet",
      change_note: "Observation indarbejdet i godkendt profilopdatering",
      old_profile_data: null,
      new_profile_data: null,
      old_readable_profile: null,
      new_readable_profile: null,
    })),
  ];

  const { data: insertedChanges, error: changeLogError } = await supabase
    .from("student_profile_changes")
    .insert(changeRows)
    .select("id");

  if (changeLogError) {
    console.error("Kunne ikke gemme profilhistorik:", changeLogError);

    const { error: rollbackError } = await supabase
      .from("student_profiles")
      .update({
        profile_data: existingProfile.profile_data || {},
        readable_profile: existingProfile.readable_profile || "",
        updated_at: existingProfile.updated_at || existingProfile.created_at,
      })
      .eq("id", existingProfile.id)
      .eq("access_code", accessCode);

    if (rollbackError) {
      console.error("Profilen kunne ikke rulles tilbage:", rollbackError);
    }

    return res.status(500).json({
      success: false,
      error: "Profilhistorikken kunne ikke gemmes. Profilopdateringen blev stoppet.",
    });
  }

  const insertedChangeIds = Array.isArray(insertedChanges)
    ? insertedChanges.map((item) => item.id).filter(Boolean)
    : [];

  if (observationsToIntegrate.length > 0) {
    const observationIds = observationsToIntegrate.map((item) => item.id);
    const reviewedAt = new Date().toISOString();

    const { data: updatedObservations, error: observationUpdateError } =
      await supabase
        .from("student_observations")
        .update({
          review_status: "indarbejdet_i_profil",
          reviewed_by_signature: accessUser.display_code,
          reviewed_at: reviewedAt,
          review_note: "Indarbejdet i godkendt profilopdatering",
        })
        .in("id", observationIds)
        .eq("access_code", accessCode)
        .eq("profile_id", existingProfile.id)
        .eq("review_status", "valgt_til_profil")
        .select("id");

    const updatedObservationIds = Array.isArray(updatedObservations)
      ? updatedObservations.map((item) => item.id)
      : [];

    if (
      observationUpdateError ||
      updatedObservationIds.length !== observationIds.length
    ) {
      console.error(
        "Kunne ikke markere observationer som indarbejdet:",
        observationUpdateError || {
          expected: observationIds.length,
          updated: updatedObservationIds.length,
        }
      );

      const { error: rollbackError } = await supabase
        .from("student_profiles")
        .update({
          profile_data: existingProfile.profile_data || {},
          readable_profile: existingProfile.readable_profile || "",
          updated_at: existingProfile.updated_at || existingProfile.created_at,
        })
        .eq("id", existingProfile.id)
        .eq("access_code", accessCode);

      if (rollbackError) {
        console.error("Profilen kunne ikke rulles tilbage:", rollbackError);
      }

      if (updatedObservationIds.length > 0) {
        const { error: restoreObservationError } = await supabase
          .from("student_observations")
          .update({
            review_status: "valgt_til_profil",
            reviewed_by_signature: accessUser.display_code,
            reviewed_at: null,
            review_note: "Valgt til den næste profilopdatering",
          })
          .in("id", updatedObservationIds)
          .eq("access_code", accessCode)
          .eq("profile_id", existingProfile.id);

        if (restoreObservationError) {
          console.error(
            "Observationer kunne ikke rulles tilbage:",
            restoreObservationError
          );
        }
      }

      if (insertedChangeIds.length > 0) {
        const { error: deleteChangeError } = await supabase
          .from("student_profile_changes")
          .delete()
          .in("id", insertedChangeIds);

        if (deleteChangeError) {
          console.error(
            "Profilhistorik kunne ikke rulles tilbage:",
            deleteChangeError
          );
        }
      }

      return res.status(500).json({
        success: false,
        error:
          "Observationerne kunne ikke markeres som indarbejdet. Profilopdateringen blev stoppet.",
      });
    }
  }

  return res.status(200).json({
    success: true,
    id: data.id,
    profile_id: data.id,
    student_name: data.student_name,
    class_group: data.class_group,
    updated_by_display_code: accessUser.display_code,
    updated_by_label: creatorLabel,
    updated_at: data.updated_at,
    integrated_observation_count: observationsToIntegrate.length,
    integrated_observation_ids: observationsToIntegrate.map(
      (observation) => observation.id
    ),
    used_exact_profile_id: Boolean(requestedProfileId),
    used_exact_observation_ids: hasObservationIds,
  });
}

async function getProfile(req, res) {
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
    .from("student_profiles")
    .select(`
      id,
      student_name,
      class_group,
      created_by_signature,
      profile_owner_signature,
      profile_data,
      readable_profile,
      status,
      created_at,
      updated_at
    `)
    .eq("access_code", accessCode)
    .ilike("student_name", studentName)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (classGroup) {
    query = query.eq("class_group", classGroup);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Kunne ikke hente elevprofil:", error);
    return res.status(500).json({
      success: false,
      error: "Elevprofilen kunne ikke hentes",
    });
  }

  if (!data?.id) {
    return res.status(404).json({
      success: false,
      error: "Der blev ikke fundet en aktiv elevprofil",
    });
  }

  return res.status(200).json({
    success: true,
    profile: data,
  });
}


export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return await getProfile(req, res);
    }

    if (req.method === "POST") {
      return await createProfile(req, res);
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      return await updateProfile(req, res);
    }

    return res.status(405).json({
      success: false,
      error: "Kun GET, POST, PUT og PATCH er understøttet",
    });
  } catch (error) {
    console.error("Fejl ved elevprofil:", error);

    return res.status(500).json({
      success: false,
      error: "Profilen kunne ikke behandles",
      details: error.message,
    });
  }
}
