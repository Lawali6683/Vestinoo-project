const https = require("https");

// ENVIRONMENT VARIABLES
const API_AUTH_KEY = process.env.API_AUTH_KEY;
const KIWI_API_KEY = process.env.KIWI_API_KEY;

const VERCEL_LOG = (...args) => console.log("[KIWI_POSTBACK]", ...args);

module.exports = async (req, res) => {
  // Allow all domains (remove domain check for local/dev)
  res.setHeader("Access-Control-Allow-Origin", "*");
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

  // Log the full request body for debugging
  VERCEL_LOG("Received request body:", req.body);

  const { uid, ip, country, city, countryLang } = req.body || {};

  if (!uid || !ip) {
    VERCEL_LOG("Missing uid or ip:", { uid, ip });
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  // Prepare API URL with all required params (leave city/countryLang for logging only)
  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${encodeURIComponent(uid)}&ip_address=${encodeURIComponent(ip)}${country ? `&country=${encodeURIComponent(country)}` : ""}`;

  VERCEL_LOG("Sending request to KiwiWall API:", apiUrl);

  // --- Helper function to fetch KiwiWall offers ---
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

  try {
    const rawResponse = await fetchKiwiOffers(apiUrl);
    VERCEL_LOG("Raw response from KiwiWall:", rawResponse);

    // Try parsing JSON safely
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (err) {
      VERCEL_LOG("JSON Parse error:", err.message);
      return res.status(502).json({
        error: "Failed to parse response from KiwiWall",
        raw: rawResponse,
        detail: err.message
      });
    }

    if (!parsedResponse || typeof parsedResponse !== "object") {
      VERCEL_LOG("Unexpected response format");
      return res.status(502).json({
        error: "Invalid response format from KiwiWall",
        raw: rawResponse
      });
    }

    // Defensive code: always return a fixed structure with batches array
    let offers = [];
    // KiwiWall returns offers in parsedResponse.offers or parsedResponse.data or directly as array
    if (Array.isArray(parsedResponse.offers)) {
      offers = parsedResponse.offers;
    } else if (Array.isArray(parsedResponse.data)) {
      offers = parsedResponse.data;
    } else if (Array.isArray(parsedResponse)) {
      offers = parsedResponse;
    } else if (parsedResponse.results && Array.isArray(parsedResponse.results)) {
      offers = parsedResponse.results;
    }

    // Defensive: If offers is not array, wrap as empty
    if (!Array.isArray(offers)) offers = [];

    // Batch the offers for frontend batching (e.g., 50 per batch)
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < offers.length; i += batchSize) {
      batches.push(offers.slice(i, i + batchSize));
    }

    // If there are no offers, always return batches as []
    VERCEL_LOG(`Returning ${batches.length} batches (${offers.length} offers)`);

    // Log the result to help debugging on the frontend
    VERCEL_LOG("Returning response:", {
      batchesCount: batches.length,
      offersCount: offers.length,
      country, city, countryLang,
      rawApiType: parsedResponse.type || "",
    });

    return res.status(200).json({
      batches,
      offersCount: offers.length,
      country: country || "",
      city: city || "",
      countryLang: countryLang || "",
      rawApiType: parsedResponse.type || "",
      rawApi: parsedResponse, // Debug: expose full API result for troubleshooting
      ok: true
    });
  } catch (error) {
    VERCEL_LOG("Request to KiwiWall failed:", error.message);
    return res.status(500).json({ error: "Internal server error contacting KiwiWall", detail: error.message });
  }
};
