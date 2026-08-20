// api/submit.js
// Vercel serverless function -- verifies the ALTCHA proof-of-work solution,
// then forwards the contact-form message to Formspree.
// The browser talks only to this endpoint now (see js/main.js); Formspree
// is called server-side so a bot can no longer bypass the captcha by
// posting straight to Formspree's public endpoint.
const { verifySolution } = require("altcha-lib");

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xeajgyzp";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const hmacKey = process.env.ALTCHA_HMAC_KEY;
  if (!hmacKey) {
    res.status(500).json({ error: "ALTCHA_HMAC_KEY is not configured." });
    return;
  }

  const body = req.body || {};
  const { altcha, name, email, subject, message } = body;

  if (!altcha) {
    res.status(400).json({ error: "Missing captcha verification." });
    return;
  }

  let verified = false;
  try {
    verified = await verifySolution(altcha, hmacKey);
  } catch (err) {
    console.error("[altcha] verification error", err);
  }

  if (!verified) {
    res.status(400).json({ error: "Captcha verification failed. Please try again." });
    return;
  }

  if (!name || !email || !message) {
    res.status(400).json({ error: "Please fill in all required fields." });
    return;
  }

  try {
    const formspreeRes = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name, email, subject, message }),
    });

    if (!formspreeRes.ok) {
      console.error("[formspree] delivery failed", await formspreeRes.text());
      res.status(502).json({ error: "Could not deliver your message. Please email us directly." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[formspree] request error", err);
    res.status(502).json({ error: "Could not deliver your message. Please email us directly." });
  }
};
