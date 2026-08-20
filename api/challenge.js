// api/challenge.js
// Vercel serverless function -- issues a fresh ALTCHA proof-of-work challenge.
// The widget on the contact form calls this automatically (challengeurl="/api/challenge").
const { createChallenge } = require("altcha-lib");

module.exports = async (req, res) => {
  const hmacKey = process.env.ALTCHA_HMAC_KEY;

  if (!hmacKey) {
    // Missing setup -- surfaced to you (the dev) via Vercel logs / response,
    // not something a visitor should ever see in production.
    res.status(500).json({ error: "ALTCHA_HMAC_KEY is not configured." });
    return;
  }

  try {
    const challenge = await createChallenge({
      hmacKey,
      maxNumber: 100000, // raise this (e.g. 1,000,000) if you want a harder/slower puzzle
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(challenge);
  } catch (err) {
    console.error("[altcha] failed to create challenge", err);
    res.status(500).json({ error: "Failed to create challenge." });
  }
};
