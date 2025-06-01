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

  if (req.method !== "POST") {
    VERCEL_LOG("Invalid method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    VERCEL_LOG("Unauthorized access attempt");
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { uid, ip, country } = req.body;

  if (!uid || !ip) {
    VERCEL_LOG("Missing uid or ip:", { uid, ip });
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${country ? `&country=${country}` : ""}`;

  VERCEL_LOG("Sending request to KiwiWall API:", apiUrl);

  try {
    // Using native https request with a Promise wrapper
    const fetchKiwiOffers = (url) => {
      return new Promise((resolve, reject) => {
        https.get(url, (kiwiRes) => {
          let data = "";
          kiwiRes.on("data", (chunk) => {
            data += chunk;
          });
          kiwiRes.on("end", () => {
            resolve(data);
          });
        }).on("error", (err) => {
          reject(err);
        });
      });
    };

    const rawResponse = await fetchKiwiOffers(apiUrl);
    VERCEL_LOG("Raw response from KiwiWall:", rawResponse);

    // Try parsing JSON safely
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (err) {
      VERCEL_LOG("JSON Parse error:", err.message);
      return res.status(502).json({ error: "Failed to parse response from KiwiWall", raw: rawResponse });
    }

    if (!parsedResponse || typeof parsedResponse !== "object") {
      VERCEL_LOG("Unexpected response format");
      return res.status(502).json({ error: "Invalid response format from KiwiWall", raw: rawResponse });
    }

    VERCEL_LOG("Successfully parsed response:", parsedResponse);
    return res.status(200).json(parsedResponse);

  } catch (error) {
    VERCEL_LOG("Request to KiwiWall failed:", error.message);
    return res.status(500).json({ error: "Internal server error contacting KiwiWall", detail: error.message });
  }
};
