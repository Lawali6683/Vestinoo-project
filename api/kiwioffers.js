const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const KIWI_API_KEY = process.env.KIWI_API_KEY;

const VERCEL_LOG = (...args) => console.log("[KIWI_POSTBACK]", ...args);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    VERCEL_LOG("Rejected non-POST request:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    VERCEL_LOG("Unauthorized access attempt:", authHeader);
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { uid, ip, country } = req.body;

  if (!uid || !ip) {
    VERCEL_LOG("Missing fields:", { uid, ip });
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  const trimmedCountry = (country || "").trim();
  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${trimmedCountry ? `&country=${trimmedCountry}` : ""}`;

  VERCEL_LOG("Constructed API URL:", apiUrl);

  try {
    const fetchKiwiOffers = (url) => {
      return new Promise((resolve, reject) => {
        https.get(url, (kiwiRes) => {
          let data = "";
          kiwiRes.on("data", (chunk) => data += chunk);
          kiwiRes.on("end", () => {
            VERCEL_LOG("KiwiWall response status:", kiwiRes.statusCode);
            VERCEL_LOG("KiwiWall raw data:", data);

            if (kiwiRes.statusCode < 200 || kiwiRes.statusCode >= 300) {
              return reject(new Error(`KiwiWall API returned status ${kiwiRes.statusCode}`));
            }

            resolve(data);
          });
        }).on("error", (err) => {
          VERCEL_LOG("Network error calling KiwiWall:", err);
          reject(err);
        });
      });
    };

    const rawResponse = await fetchKiwiOffers(apiUrl);
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (err) {
      VERCEL_LOG("Failed to parse response JSON:", rawResponse);
      return res.status(502).json({
        error: "Failed to parse KiwiWall response",
        raw: rawResponse
      });
    }

    const offers = parsedResponse?.offers;

    if (!Array.isArray(offers) || offers.length === 0) {
      VERCEL_LOG("No offers found:", parsedResponse);
      return res.status(200).json({ message: "No offers found" });
    }

    VERCEL_LOG("Offers retrieved:", offers.length);
    return res.status(200).json({
      uid,
      totalOffers: offers.length,
      offers
    });

  } catch (error) {
    VERCEL_LOG("Unexpected error:", error.message);
    return res.status(500).json({ error: "Error contacting KiwiWall", detail: error.message });
  }
};
