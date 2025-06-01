const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const KIWI_API_KEY = process.env.KIWI_API_KEY;

const VERCEL_LOG = (...args) => console.log("[KIWI_POSTBACK]", ...args);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    VERCEL_LOG("OPTIONS preflight received");
    return res.status(204).end();
  }

  // Validate method
  if (req.method !== "POST") {
    VERCEL_LOG("Invalid method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate API key
  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    VERCEL_LOG("Unauthorized access attempt");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  // Log incoming request
  VERCEL_LOG("Incoming body:", req.body);

  const { uid, ip, country } = req.body;

  if (!uid || !ip) {
    VERCEL_LOG("Missing uid or ip:", { uid, ip });
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${country ? `&country=${country}` : ""}`;

  VERCEL_LOG("Sending request to KiwiWall API:", apiUrl);

  https.get(apiUrl, (kiwiRes) => {
    let data = "";

    kiwiRes.on("data", (chunk) => {
      data += chunk;
    });

    kiwiRes.on("end", () => {
      VERCEL_LOG("Raw response from KiwiWall:", data);

      try {
        const parsed = JSON.parse(data);
        VERCEL_LOG("Parsed response from KiwiWall:", parsed);
        res.status(200).json(parsed);
      } catch (error) {
        VERCEL_LOG("Failed to parse JSON:", error.message);
        res.status(500).json({ error: "Failed to parse response from KiwiWall" });
      }
    });
  }).on("error", (err) => {
    VERCEL_LOG("Request error:", err.message);
    res.status(500).json({ error: "Error contacting KiwiWall", detail: err.message });
  });
};
