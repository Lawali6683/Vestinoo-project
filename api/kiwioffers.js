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
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  const { uid, ip, country } = req.body;

  if (!uid || !ip) {
    return res.status(400).json({ error: "Missing required fields: uid and ip" });
  }

  const trimmedCountry = (country || "").trim();
  const apiUrl = `https://www.kiwiwall.com/get-offers/${KIWI_API_KEY}/?s=${uid}&ip_address=${ip}${trimmedCountry ? `&country=${trimmedCountry}` : ""}`;

  try {
    const fetchKiwiOffers = (url) => {
      return new Promise((resolve, reject) => {
        https.get(url, (kiwiRes) => {
          let data = "";
          kiwiRes.on("data", (chunk) => data += chunk);
          kiwiRes.on("end", () => resolve(data));
        }).on("error", (err) => reject(err));
      });
    };

    const rawResponse = await fetchKiwiOffers(apiUrl);
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (err) {
      return res.status(502).json({ error: "Failed to parse KiwiWall response", raw: rawResponse });
    }

    const offers = parsedResponse?.offers;
    if (!Array.isArray(offers) || offers.length === 0) {
      return res.status(200).json({ message: "No offers found" });
    }

    // Raba zuwa kashi-kashi (batches)
    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < offers.length; i += batchSize) {
      batches.push(offers.slice(i, i + batchSize));
    }

    return res.status(200).json({
      uid,
      totalOffers: offers.length,
      batchCount: batches.length,
      batches // => frontend zai karɓi batches[n] daya bayan daya
    });

  } catch (error) {
    return res.status(500).json({ error: "Error contacting KiwiWall", detail: error.message });
  }
};
