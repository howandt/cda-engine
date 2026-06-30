const RESEND_ENDPOINT = "https://api.resend.com/emails";

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ fejl: "Kun POST er tilladt." });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY mangler i Vercel.");
    return res.status(500).json({ fejl: "Mailtjenesten er ikke konfigureret." });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const navn = cleanText(body.navn, 100);
    const email = cleanText(body.email, 200).toLowerCase();
    const telefon = cleanText(body.telefon, 50);
    const organisation = cleanText(body.organisation, 150);
    const type = cleanText(body.type, 100);
    const besked = cleanText(body.besked, 2000);
    const samtykke = body.samtykke === true;

    if (!navn || !email || !organisation || !type || !besked) {
      return res.status(400).json({
        fejl: "Navn, e-mail, organisation, type og besked er påkrævet.",
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({ fejl: "Indtast en gyldig e-mailadresse." });
    }

    if (!samtykke) {
      return res.status(400).json({
        fejl: "Du skal acceptere, at CDAI Systems må kontakte dig.",
      });
    }

    const safeSubjectName = navn.replace(/[\r\n]+/g, " ");

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CDA System <kontakt@cdaisystems.com>",
        to: ["kontakt@cdaisystems.com"],
        reply_to: email,
        subject: `Ny testanmodning – CDA – ${safeSubjectName}`,
        text: `Navn: ${navn}
E-mail: ${email}
Telefon: ${telefon || "—"}
Jeg er: ${type}
Skole, institution eller organisation: ${organisation}
Prøveperiode: Ja, ønsker 30 dages gratis test

Hvad ønskes afprøvet:
${besked}`,
      }),
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error("Resend-fejl:", resendResponse.status, resendData);
      return res.status(502).json({
        fejl: "Beskeden kunne ikke sendes. Prøv igen senere.",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Kontaktformular-fejl:", error);
    return res.status(500).json({
      fejl: "Der opstod en fejl. Prøv igen senere.",
    });
  }
}
