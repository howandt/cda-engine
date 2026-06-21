import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ fejl: "Kun POST er tilladt" });
  }

  const { kode } = req.body || {};

  if (!kode) {
    return res.status(400).json({ fejl: "Ingen kode angivet" });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("adgangskoder")
    .select("*")
    .eq("kode", kode.trim().toUpperCase())
    .eq("system", "cda")
    .single();

  if (error || !data) {
    return res.status(404).json({ fejl: "Koden blev ikke fundet." });
  }

  if (data.status === "inaktiv") {
    return res.status(403).json({ fejl: "Denne kode er deaktiveret." });
  }

  if (data.status === "pause") {
    return res.status(403).json({
      fejl: "Denne kode er midlertidigt sat på pause.",
    });
  }

  if (data.udloebsdato && new Date(data.udloebsdato) < new Date()) {
    return res.status(403).json({ fejl: "Denne kode er udløbet." });
  }

  return res.status(200).json({ ok: true });
}